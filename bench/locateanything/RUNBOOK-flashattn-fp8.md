# Runbook：flash-attn + FP8 第二轮实测（WSL Ubuntu 24.04 × RTX 5060 Ti）

> 承接性能报告 [`docs/LocateAnything-3B-5060Ti-性能报告.md`](../../docs/LocateAnything-3B-5060Ti-性能报告.md) §8「Linux 实测下一步」。
> 目标机：RTX 5060 Ti 16G（Blackwell, sm_120）+ **Ubuntu 24.04 WSL2**（Python 3.12 / gcc 13.3 / glibc 2.39）+ torch 2.11.0+cu128 + transformers 4.57.1。
> 在 GPU 机上 `git pull` 后，进 WSL、`source la3b/bin/activate`，从 Step 0 开始逐段复制粘贴。
> 全部命令基于 2026-07 的联网核实（flash-attn 2.8.3 / torchao 0.17 / 模型 remote code 源码）。

---

## 0. 先看结论：方向已经变了（别照报告 §8 老计划死磕）

第二轮开跑前，几个把老计划推翻的**已核实事实**：

| 事项 | 报告 §8 老假设 | 本轮核实后 | 影响 |
|---|---|---|---|
| **MagiAttention** | 官方推荐、想装 | ❌ **不装**：它是多卡**训练**库，Blackwell 分支只瞄 sm_100(B200)、要 CUDA 13，v1.0.5 还是 Hopper-only。模型缺它会**优雅回退 SDPA** | 删掉这条 |
| **flash-attn** | 要么装不上要么源码硬编 | ✅ **有 sm_120 预编译轮子**（2.8.3+cu128torch2.11+cp312），一行 pip 装，不用编译 | Step 1，几分钟 |
| **flash-attn 增益** | 预期提速明显 | ⚠️ **预期有限**：模型 remote code 里 flash_attn 全是可选守卫，且耗时大头是自定义 **MTP block-diffusion 掩码**，FA2 的 dense/causal 核服务不到它；torch 2.11 的 SDPA 本就已派发到融合后端 → 你现在 477ms **已在用融合注意力** | 做，但别指望翻倍 |
| **FP8** | 泛泛「torchao 量化」 | ✅ 走 torchao，但**必须排除视觉塔/box 头** + **`KernelPreference.TORCH`**（否则 sm_120 上静默走慢路，FP8 反而不快）。bench.py 的 `--fp8` 已按此修好 | Step 2，**真正的提速杠杆** |
| **批处理** | 「不支持，only batch=1」 | ⚠️ **可能是误判**：官方 `batch_infer.py` 实测 batch=4 能跑(A100)；bench.py 手搓 batch 失败只是拼 batch 方式不对 | Step 4，**最大的吞吐杠杆，值得复测** |

**优先级建议（按性价比）**：**Step 2（FP8）> Step 4（复测批处理）> Step 3（一卡多实例）> Step 1（flash-attn，锦上添花）**。
你点名要 flash-attn + FP8，两个都写了；但如果时间有限，FP8 和批处理复测的收益远大于 flash-attn。

---

## 0.5 环境自检（每次开工先跑，30 秒）

```bash
# 进 WSL 后，激活报告那轮建好的 venv（若在别处自行改路径）
source ~/la3b/bin/activate

# torch 必须是 2.11.0+cu128，能力必须 (12, 0) = sm_120，且真能用 GPU
python -c "import torch; print(torch.__version__, torch.version.cuda); \
print('cap', torch.cuda.get_device_capability()); print('cuda?', torch.cuda.is_available()); \
print(torch.zeros(3).cuda()*2)"
# 期望：2.11.0+cu128  12.8 / cap (12, 0) / cuda? True / tensor([0.,0.,0.], device='cuda:0')

# WSL 里能看到卡（来自宿主驱动 /usr/lib/wsl/lib）
nvidia-smi | head -12 || /usr/lib/wsl/lib/nvidia-smi | head -12
```

- `cap` 不是 `(12, 0)` 或 `cuda? False` → 先修 WSL GPU 直通（Windows 侧装最新 NVIDIA 驱动 R570+，**WSL 内不要装驱动**），别往下走。
- 模型没下的话（`ls ./LocateAnything-3B`）按 [`README.md`](README.md) A3 先下（`HF_ENDPOINT=https://hf-mirror.com huggingface-cli download nvidia/LocateAnything-3B --local-dir ./LocateAnything-3B`）。

先拿一个 **BF16 + sdpa 基线**，后面所有优化都跟它比（延迟 + boxed 精度）：

```bash
cd ~/autotk/bench/locateanything   # 仓库在 /mnt/i 的话：cd /mnt/i/projects/开发tk养号-发布自动化/bench/locateanything
python bench.py --model ~/LocateAnything-3B --images shots --runs 10 --attn sdpa --max-side 768 --out out_bf16_sdpa
# 记下「整体单张中位延迟」和峰值显存；打开 out_bf16_sdpa/boxed_*.PNG 确认红框套准（这是精度金标准）
```

---

## 1. flash-attn（预编译轮子，首选，不用编译）

flash-attn 2.8.3 的 setup.py 默认 `FLASH_ATTN_CUDA_ARCHS="80;90;100;120"`，CUDA≥12.8 时就带 sm_120 核。社区预编译索引里有跟你这套字节对齐的轮子：

```bash
# 一行装（二进制，不编译）。若 404 见下方「换轮子」。
pip install "https://github.com/mjun0812/flash-attention-prebuild-wheels/releases/download/v0.9.4/flash_attn-2.8.3+cu128torch2.11-cp312-cp312-linux_x86_64.whl"

# 验证真能在 GPU 上跑一次前向
python - <<'PY'
import torch, flash_attn
from flash_attn import flash_attn_func
print("flash_attn", flash_attn.__version__)                       # 2.8.3
q = torch.randn(2, 1024, 8, 64, device="cuda", dtype=torch.bfloat16)
o = flash_attn_func(q, q, q)
print("ok", tuple(o.shape), o.dtype)                              # ok (2, 1024, 8, 64) torch.bfloat16
PY
```

装好后用 flash-attn 跑同一组图，跟 0.5 的 sdpa 基线对比：

```bash
python bench.py --model ~/LocateAnything-3B --images shots --runs 10 --attn flash_attention_2 --max-side 768 --out out_fa2
# 比 out_bf16_sdpa：延迟降没降？boxed_* 精度有没有变？
```

> **诚实预期**：多半只小幅提速，甚至持平——耗时大头（MTP 解码）FA2 帮不到，SDPA 已是融合核。若持平，**留 sdpa 即可**，别为它折腾源码编译。

**换轮子（URL 404 / 想换 torch 版本时）**：去索引页挑对应 `cuXXXtorchY.Y-cpXXX` 的那颗：
`https://github.com/mjun0812/flash-attention-prebuild-wheels/releases` 或 `https://mjunya.com/flash-attention-prebuild-wheels/`
（务必对齐**你的** torch(2.11) × CUDA(cu128) × Python(cp312)；对不上会 `undefined symbol` 导入报错。）

### 1b.（可选，仅当预编译轮子导入失败）源码编译 flash-attn

只有轮子这条路彻底走不通再来。**先装 CUDA Toolkit（nvcc），只装 toolkit，绝不装驱动**：

```bash
# wsl-ubuntu 专用源（不是 ubuntu2404 通用源，后者会带驱动）
wget https://developer.download.nvidia.com/compute/cuda/repos/wsl-ubuntu/x86_64/cuda-keyring_1.1-1_all.deb
sudo dpkg -i cuda-keyring_1.1-1_all.deb && sudo apt-get update
sudo apt-get -y install cuda-toolkit-12-8      # 千万别装 cuda / cuda-drivers！会砸掉 WSL 直通

# PATH（追加到 ~/.bashrc 后 source）
echo 'export CUDA_HOME=/usr/local/cuda-12.8' >> ~/.bashrc
echo 'export PATH=$CUDA_HOME/bin:$PATH' >> ~/.bashrc
echo 'export LD_LIBRARY_PATH=$CUDA_HOME/lib64:$LD_LIBRARY_PATH' >> ~/.bashrc
source ~/.bashrc
nvcc --version    # 必须 release 12.8

# 只编 sm_120（默认编 4 个架构，慢 4 倍且 16G 内存会 OOM）
pip install -U pip ninja packaging wheel setuptools
FLASH_ATTN_CUDA_ARCHS="120" MAX_JOBS=4 NVCC_THREADS=2 \
FLASH_ATTENTION_FORCE_BUILD=TRUE \
pip install flash-attn==2.8.3.post1 --no-build-isolation
```

⚠️ **已知坑**：`FLASH_ATTN_CUDA_ARCHS=120` 源码编 2.x 反向核在 CUDA 12.8/12.9 + WSL 上有 **nvcc 段错误(Dao-AILab #2361，仍开放)**——**这正是首选预编译轮子的原因**。段错误就降 `MAX_JOBS` 或换 CUDA 12.9 nvcc；还不行就放弃 flash-attn 留 sdpa（增益本就有限）。

---

## 2. FP8（torchao）—— 本轮真正的提速杠杆

```bash
# torchao 0.17 对齐 torch 2.11、ABI 稳，无需源码编译
pip install "torchao==0.17.0"
python -c "import torch, torchao; print(torch.__version__, torchao.__version__, torch.cuda.get_device_capability())"
# 期望：2.11.0+cu128  0.17.0  (12, 0)
```

bench.py 的 `--fp8` 已按调研修对（**只量 LLM 解码层、排除 MoonViT 视觉塔/box 头、dynamic 模式带 `KernelPreference.TORCH`**）。两种模式各跑一遍：

```bash
# 提速档：动态激活+权重 PerRow（sm_120 上走 torch._scaled_mm，≈2.5×BF16 理论）
python bench.py --model ~/LocateAnything-3B --images shots --runs 10 --attn sdpa --max-side 768 --fp8 --fp8-mode dynamic --out out_fp8_dyn

# 精度档：只量权重、激活留 BF16（batch1 几乎不提速，作精度对照）
python bench.py --model ~/LocateAnything-3B --images shots --runs 10 --attn sdpa --max-side 768 --fp8 --fp8-mode weight --out out_fp8_wt
```

**必做的精度复核（FP8 对 grounding 坐标比对文本敏感）**：

```bash
# 逐一对比 BF16 基线 vs FP8 的红框位置，坐标不能塌
#（人眼看 boxed 图最快；×/Don't Allow/点赞键这些小目标最容易在量化后飘）
ls out_bf16_sdpa/boxed_*.PNG out_fp8_dyn/boxed_*.PNG
```

判定：
- **dynamic 提速明显 + boxed 精度没塌** → 采用 dynamic，这是生产档。
- **dynamic 精度塌了**（框飘/丢小目标）→ 退 weight 档（精度稳但不提速），或干脆留 BF16（3B BF16 才 ~6.8G，16G 卡装得下，FP8 在这里买的是速度不是显存）。
- **dynamic 跟 BF16 同速甚至更慢** → `KernelPreference.TORCH` 没生效（bench 会打印 `⚠ 取不到 KernelPreference.TORCH`），升级 torchao（`pip install -U torchao`）再试。

> vLLM / TensorRT-LLM 这条 FP8 路**不通**：模型的 Parallel-Box-Decoding 是 transformers 原生自定义 generate，vLLM 跑不了这条路径、TRT-LLM/Triton 官方明说不支持。torchao-in-transformers 是唯一保住 PBD 的 FP8 路。

---

## 3. 一卡多实例（无批处理时提单卡吞吐的主力）

batch1 时 GPU 没吃满，并发跑 K 个独立单流实例、吞吐求和。FP8 后权重仅 ~3.4G，一卡塞 3–4 个：

```bash
# 先确认单实例显存（看 Step 2 输出的峰值），据此定 K；另开终端 watch -n1 nvidia-smi 看占用
MODEL=~/LocateAnything-3B IMAGES=$PWD/shots bash multiinstance.sh 2 --attn sdpa --max-side 768 --fp8
MODEL=~/LocateAnything-3B IMAGES=$PWD/shots bash multiinstance.sh 3 --attn sdpa --max-side 768 --fp8
# 脚本末尾直接打印「聚合吞吐 ≈ X 张/秒（N 实例之和）」。找吞吐不再随 N 上升的拐点 = 单卡上限。
```

---

## 4.（加分，最大的吞吐杠杆）复测批处理

报告说「批处理不支持」是基于 bench.py 手搓 batch 失败；但模型仓库**自带 `batch_infer.py`，官方在 A100 上实测 batch=4**。手搓失败很可能只是 MoonViT 变长 patch 的 batch 拼接方式不对，**不等于模型不支持 batch**。这是承载量估算里**最不确定、杠杆最大**的一项，值得用官方脚本复测：

```bash
# batch_infer.py 就在下好的模型目录里
python ~/LocateAnything-3B/batch_infer.py --help     # 先看它真实参数（--batch-size / --attn 选项名以 --help 为准）
# 官方示例形如：python batch_infer.py --model . --attn la_flash --batch-size 4 ...
cd ~/LocateAnything-3B
python batch_infer.py --model . --batch-size 4 --attn sdpa   # 按 --help 补图片/输出参数
# 若 batch=4 能跑通：单张摊薄延迟 ÷ 相对 batch1，就是批处理吞吐乘数——直接回填报告 §7.0/§8.2
```

跑通的话，把「批处理不支持」这条从报告 §7.0 撤下，承载量从保守档往上修。

---

## 5. 读数 & 回填

四轮出数后（BF16/sdpa、fa2、fp8-dyn、多实例、可能的 batch），把**单卡最优吞吐（张/秒）**和**精度是否达标**代进报告 §7 的公式：
`可带手机数 ≈ 吞吐 × 每台调用间隔 × 0.6`。回填 [`docs/LocateAnything-3B-5060Ti-性能报告.md`](../../docs/LocateAnything-3B-5060Ti-性能报告.md) §7.0/§8 和《内网集中识别服务器-架构设计》§6，承载量从「外推」变「定案」。

---

## 6. 常见报错速查

| 症状 | 原因 / 处理 |
|---|---|
| flash-attn 装完 `import` 报 `undefined symbol` | 轮子的 torch/CUDA/python 版本没对齐你的栈。换索引页上匹配 `cu128torch2.11 cp312` 的那颗；torch 别升到 2.12 |
| `no kernel image is available` | 跑的核没 sm_120。torch 不是 +cu128（重装 cu128）；或源码编 flash-attn 忘了 `FLASH_ATTN_CUDA_ARCHS="120"` |
| 加载模型时去够 `magi_attention` / magi 相关报错 | config 默认 attn 是 "magi"。**显式传 `--attn sdpa` 或 `flash_attention_2`**（bench.py 默认已是 sdpa） |
| FP8 后框飘/丢小目标（×、点赞键） | dynamic 量化伤了坐标精度。退 `--fp8-mode weight`，或留 BF16。**务必别量视觉塔**（bench 已排除） |
| FP8 跟 BF16 同速/更慢 | `KernelPreference.TORCH` 没生效（走了反量化慢路）。`pip install -U torchao`；看 bench 有没有打印那条 ⚠ |
| 源码编 flash-attn 时 nvcc 段错误 | 已知 bug #2361。用预编译轮子；非要编就降 `MAX_JOBS`、加 swap、或换 CUDA 12.9 nvcc |
| WSL 里 `nvidia-smi` 找不到 | 宿主装/升级 NVIDIA 驱动（R570+），**WSL 内别装驱动**；`wsl --update` 后重开。或直接 `/usr/lib/wsl/lib/nvidia-smi` |
| `apt install cuda` 之后 GPU 直通坏了 | 装错包了（拉进了 Linux 驱动）。只能装 `cuda-toolkit-12-8`；卸掉 `cuda-drivers` 重来 |
