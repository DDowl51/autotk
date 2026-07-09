# LocateAnything-3B × RTX 5060 Ti × iPhone 8 实测指引（Windows 主机）

目的：测出**决定承载量的唯一硬指标**——iPhone 8(750×1334)截图上单目标 grounding 的延迟、精度，
换算成「一张 5060 Ti 能带多少台手机」。跑完 `bench.py` 末尾会直接打印承载量表。

> ⚠️ **模型官方标注 Linux only**。你的主机是 Windows → **强烈建议走 WSL2（路径 A）**：物理机是 Windows，
> 里面跑真 Linux + GPU 直通，模型原生支持、不折腾。原生 Windows（路径 B）能不能跑没保证（自定义模型代码 +
> flash-attn 在 Windows 常出问题），只作兜底尝试。

---

## 路径 A（推荐）：Windows + WSL2 + GPU 直通

### A0. 装 WSL2 + Ubuntu（管理员 PowerShell，一次性）

```powershell
wsl --install -d Ubuntu-22.04      # 装完按提示重启、设个 Linux 用户名密码
```
Windows 侧装好 **NVIDIA 驱动**即可（WSL 用宿主驱动，**WSL 内不要再装驱动**）。进 Ubuntu：

```powershell
wsl -d Ubuntu-22.04
```

### A1. 在 WSL 里确认 GPU 直通

```bash
nvidia-smi          # 能看到 RTX 5060 Ti 就说明 GPU 直通 OK
```

### A2. 建环境 + 装依赖（在 WSL Ubuntu 里）

```bash
sudo apt update && sudo apt install -y python3-venv python3-pip
python3 -m venv la3b && source la3b/bin/activate
pip install --upgrade pip
# PyTorch + torchvision：必须 CUDA 12.8 轮子才认 Blackwell(sm_120)，且 torchvision 要配套同源
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128
# 模型远程代码还要 decord、lmdb（视频/存储库，图像用不到但 import 检查会拦）
pip install "transformers==4.57.1" accelerate "opencv-python-headless==4.11.0.86" "Pillow==11.1.0" huggingface_hub decord lmdb
```

验证 torch 认得这张卡（**跑真算子**，不能只看 capability——cu124 也会打印 (12,0) 但一跑就 `no kernel image`）：

```bash
python -c "import torch; print(torch.__version__); assert torch.cuda.is_available(); print(torch.zeros(3).cuda()*2)"
# 版本号须含 +cu128，且能打印 tensor([...], device='cuda:0') 不报错
```

> WSL 里访问 Windows 磁盘：`C:\` = `/mnt/c/`。仓库在 `I:\projects\...` → WSL 里是 `/mnt/i/projects/...`。

### A3. 下模型（约 7GB，BF16）

```bash
huggingface-cli download nvidia/LocateAnything-3B --local-dir ./LocateAnything-3B
```

之后跳到 **步骤 3（准备截图）→ 4（跑）→ 5（读数）**，命令直接用（bash）。

---

## 路径 B（兜底，不保证成）：原生 Windows + PowerShell

模型是 Linux only，此路径可能在加载自定义代码或 flash-attn 处报错。愿意试就按下面来；报错就回路径 A。

```powershell
# 建虚拟环境
py -3 -m venv la3b
.\la3b\Scripts\Activate.ps1        # 若被策略拦：Set-ExecutionPolicy -Scope Process RemoteSigned
python -m pip install --upgrade pip

# PyTorch + torchvision：必须 CUDA 12.8 轮子才认 Blackwell(sm_120)。若之前装过 cu124/cpu 版，先卸干净：
pip uninstall -y torch torchvision torchaudio
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128
# 模型远程代码还要 decord、lmdb（视频/存储库，图像用不到但 import 检查会拦）
pip install "transformers==4.57.1" accelerate "opencv-python-headless==4.11.0.86" "Pillow==11.1.0" huggingface_hub decord lmdb

# 验证认卡（跑真算子，不能只看 capability——cu124 也会打印 (12,0) 但一跑就崩）
python -c "import torch; print(torch.__version__); assert torch.cuda.is_available(); print(torch.zeros(3).cuda()*2)"
# 版本号须含 +cu128，且能打印 tensor([...], device='cuda:0') 不报错

# 下模型（或跑时直接用仓库名 nvidia/LocateAnything-3B 让它自动下）
huggingface-cli download nvidia/LocateAnything-3B --local-dir .\LocateAnything-3B
```

> ⚠️ **本地文件夹不存在时**，`--model .\LocateAnything-3B` 会被当成 HF 仓库名、因反斜杠报
> `HFValidationError`。要么先下好（上面这条），要么跑时直接 `--model nvidia/LocateAnything-3B` 自动下载。

跑的时候**加 `--attn sdpa`**绕开 flash-attn（Windows 装 flash-attn 极痛苦）：
```powershell
python <autotk>\bench\locateanything\bench.py --model .\LocateAnything-3B --images shots --runs 10 --attn sdpa --out out
```
拷截图用 `Copy-Item`（见步骤 3 的 Windows 变体）。若加载模型即报 Linux 相关错，别硬刚，转路径 A。

---

## 3. 准备测试截图（现成的）

仓库里就有 iPhone 8 真机 TikTok 截图，含点赞键/×/Don't Allow/文案/评论——正好覆盖要定位的目标。
⚠️ 那个目录里混了少数 **1170×2532（别的机型）和 calib_\* 裁片**，别拷进来（会污染延迟）。只拷 750×1334 的：

仓库路径：Windows 本地是 `I:\projects\开发tk养号-发布自动化\apps\mobile\adaptation\screenshots`；
WSL 里同一盘符是 `/mnt/i/projects/开发tk养号-发布自动化/apps/mobile/adaptation/screenshots`。

**路径 A（WSL，bash）**：
```bash
mkdir -p shots
SRC=/mnt/i/projects/开发tk养号-发布自动化/apps/mobile/adaptation/screenshots
cp "$SRC"/IMG_0001.PNG "$SRC"/IMG_0002.PNG "$SRC"/IMG_0003.PNG "$SRC"/IMG_0007.PNG "$SRC"/IMG_0008.PNG \
   "$SRC"/location-popup.png "$SRC"/location-comment.png "$SRC"/comment.png \
   "$SRC"/search-result.png "$SRC"/stream-video.png shots/
```

**路径 B（PowerShell）**：
```powershell
New-Item -ItemType Directory -Force shots | Out-Null
$src = "I:\projects\开发tk养号-发布自动化\apps\mobile\adaptation\screenshots"
"IMG_0001.PNG","IMG_0002.PNG","IMG_0003.PNG","IMG_0007.PNG","IMG_0008.PNG",
 "location-popup.png","location-comment.png","comment.png","search-result.png","stream-video.png" |
  ForEach-Object { Copy-Item "$src\$_" shots\ }
```

> 别拷该目录里的 `calib_*` 裁片和 `1170×2532` 的（别的机型，会污染延迟）。
> `bench.py` 每行会打印该图分辨率，看到非 `750x1334` 的剔掉重跑。

## 4. 跑实测

`--images` 传**目录**即可（脚本自动收 png/PNG，大小写不敏感——省得在 Linux 上被 `*.PNG` 漏掉 `.png`）：

```bash
# WSL：
python bench.py --model ./LocateAnything-3B --images shots --runs 10 --out out
```
```powershell
# 原生 Windows（加 --attn sdpa 绕 flash-attn）：
python bench.py --model .\LocateAnything-3B --images shots --runs 10 --attn sdpa --out out
```

- `--runs 10`：每张图跑 10 次取中位，去抖动。
- `--max-new-tokens 64`：单框输出很短，压小提速（官方默认 2048 是浪费）。
- 想测「所有目标同一句提示」的纯延迟，可加 `--prompt "the like button"`（脚本默认按文件名给每张图对应目标，见 `CASES`）。

## 5. 怎么读结果

脚本末尾直接打印：

```
整体单张中位延迟：XXX ms  →  单流吞吐 ≈ Y.YY 张/秒（batch1）
峰值显存：Z.ZZ GB / 16 GB
单卡承载量估算（phones ≈ 吞吐 × 每台两次 VLM 调用间隔 × 0.6 余量）：
      每台调用间隔 |             用法 |   可带手机数
            4s | 纯VLM每步(下限) |        N 台
            5s | 纯VLM每步(上限) |        N 台
           30s |        混合·兜底 |        N 台
           60s |     混合·稀疏兜底 |        N 台
```

- **延迟/吞吐**：这是硬指标。iPhone 8 分辨率低，预期 batch1 单张几百 ms 级。
- **承载量表**：直接告诉你「纯 VLM 每步」和「混合兜底」两种用法各能带多少台。对照架构设计稿 §6。
- **显存**：应远低于 16GB（3B BF16 权重 ~6.8GB + 这么小的图，KV cache 很小）。
- **精度**：打开 `out/boxed_*.PNG`，红框套没套准目标（×、Don't Allow、点赞键）。**定位准不准比延迟更重要**——不准就得换提示词措辞或考虑微调。

## 6. 若要逼近上限（可选，第二轮）

batch1 是保守下限。真实服务这样提吞吐（预期再翻数倍）：

- **批处理**：多台手机截图凑一批推理（同为 750×1334，无 padding，效率最高）。
- **vLLM / TensorRT-LLM 上 Blackwell 原生 FP8**：吞吐约翻倍、显存减半（3B FP8 ≈ 3.4GB）。⚠️ grounding 坐标对量化可能敏感，务必用 `out/boxed_*` 复核 FP8 后精度不塌。
- 把这些实测数回填到 `docs/内网集中识别服务器-架构设计.md` 的 §6 / D1，承载量就从「估算」变「确定」。

## 常见报错

- `no kernel image is available` / 跑不动：torch 轮子不对，重装 `--index-url .../cu128`（步骤 A2/B）。
- WSL 里 `nvidia-smi` 找不到卡：Windows 侧装/升级 NVIDIA 驱动，**WSL 内别装驱动**；`wsl --update` 后重开。
- `requires ... decord, lmdb, torchvision`：模型远程代码的依赖，装上即可（见步骤 A2/B 的 pip 行）。torchvision 务必走 cu128 源配套。
- Windows 上 `pip install decord` 装不上：改装 fork `pip install eva-decord`（同名可导入，Windows 轮子更全）。
- 原生 Windows 缺 `flash_attn` / 加载模型报 Linux 相关错：加 `--attn sdpa` 试；仍不行就**转路径 A（WSL）**，别在 Windows 硬编译 flash-attn。
- `py_apply_chat_template` / `process_vision_info` 报不存在：模型远程代码版本变了，照 https://huggingface.co/nvidia/LocateAnything-3B 最新示例改 `ground()` 里那几行。
- 中文路径在 WSL 下 `cd` 麻烦：用 `SRC=/mnt/i/...` 变量（步骤 3）或把 `shots` 建在纯英文目录。
