# LocateAnything-3B × RTX 5060 Ti × iPhone 8 实测指引

目的：测出**决定承载量的唯一硬指标**——iPhone 8(750×1334)截图上单目标 grounding 的延迟、精度，
换算成「一张 5060 Ti 能带多少台手机」。跑完 `bench.py` 末尾会直接打印承载量表。

> 环境要求：**Linux**（模型 Linux only）+ RTX 5060 Ti（Blackwell/sm_120）+ NVIDIA 驱动 ≥ 570。
> Windows 跑不了这个模型；在你的 GPU 服务器（Linux）上做。

## 0. 确认 GPU 和驱动

```bash
nvidia-smi          # 能看到 RTX 5060 Ti + 驱动版本(≥570) 即可
```

## 1. 建 Python 环境 + 装依赖

```bash
python3 -m venv la3b && source la3b/bin/activate
pip install --upgrade pip

# PyTorch：必须 CUDA 12.8 轮子才认 Blackwell(sm_120)
pip install torch --index-url https://download.pytorch.org/whl/cu128

# 模型卡钉的依赖
pip install "transformers==4.57.1" accelerate "opencv-python-headless==4.11.0.86" "Pillow==11.1.0" huggingface_hub
```

验证 torch 认得这张卡（关键，Blackwell 装错轮子会 `no kernel image`）：

```bash
python -c "import torch;print(torch.__version__, torch.cuda.is_available(), torch.cuda.get_device_name(0), torch.cuda.get_device_capability(0))"
# 期望：cuda 可用、名字含 5060 Ti、capability 应为 (12, 0)
```

## 2. 下载模型（约 7GB，BF16）

```bash
huggingface-cli download nvidia/LocateAnything-3B --local-dir ./LocateAnything-3B
```

## 3. 准备测试截图（现成的）

仓库里就有 iPhone 8 真机 TikTok 截图，含点赞键/×/Don't Allow/文案/评论——正好覆盖要定位的目标。
⚠️ 那个目录里混了少数 **1170×2532（别的机型）和 calib_\* 裁片**，别拷进来（会污染延迟）。只拷 750×1334 的：

```bash
mkdir -p shots
cd /path/to/autotk/apps/mobile/adaptation/screenshots
# 关键弹窗目标 + 若干信息流/评论/搜索页（都是 750x1334）
cp IMG_0001.PNG IMG_0002.PNG IMG_0003.PNG IMG_0007.PNG IMG_0008.PNG \
   location-popup.png location-comment.png comment.png \
   search-result.png stream-video.png /path/to/shots/
```

> `bench.py` 每行会打印该图分辨率，若看到非 `750x1334` 的，说明混进了别的机型截图，剔掉重跑。

## 4. 跑实测

```bash
python bench.py --model ./LocateAnything-3B --images "shots/*.PNG" --runs 10 --out out
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

- `no kernel image is available` / 跑不动：torch 轮子不对，重装 `--index-url .../cu128`（见步骤 1）。
- 提示缺 `flash_attn`：装 `pip install flash-attn --no-build-isolation`（需 CUDA toolkit/nvcc），或先不管——基础路径不强依赖。
- `py_apply_chat_template` / `process_vision_info` 报不存在：说明模型远程代码版本变了，照 https://huggingface.co/nvidia/LocateAnything-3B 最新示例改 `ground()` 里那几行。
