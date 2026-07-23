# LocateAnything-3B × RTX 5060 Ti 16G 实测报告

> 原始首轮实测：2026-07-10。事实整理：2026-07-23。
> 脚本：[`../bench/locateanything/bench.py`](../bench/locateanything/bench.py)。
> 样本：`bench/locateanything/shots/` 内 10 张 iPhone 8 / TikTok 截图。

本文只保留已经测到的结果、由结果直接算出的保守估计，以及仍需验证的项目。早期 batch、FP8、flash-attn 和“单卡上百台”的外推已经被后续实测推翻，不再作为部署依据。

## 1. 当前结论

| 项目 | 当前结论 | 证据等级 |
|---|---|---|
| 模型用途 | 适合作为 UI 单目标坐标来源 | 768 样本实测 |
| grounding | 一次请求只定位一个目标；多目标必须逐个请求 | 2026-07-21 真机确认 |
| batch | 当前模型路径只支持 batch=1 | 实测 |
| 768 延迟 | 中位约 477 ms，约 2.1 张/秒 | RTX 5060 Ti / BF16 / SDPA 实测 |
| 512 延迟 | 中位约 280 ms，约 3.57 张/秒 | 同环境实测 |
| 精度 | 768 的有效 grounding 样本命中；512 丢约 15px 的促销关闭键 | 样本实测 |
| 显存 | 768 / batch1 峰值约 8.4 GB | 实测 |
| 生产基线 | Ubuntu 24.04、BF16、SDPA、max-side 640、temperature 0.7 | 当前决策；640 待真机逐目标验收 |
| 裸单卡规划 | 约 10 台量级，不是上线承诺 | 2.1 张/秒与约 7–8 秒/次调用的保守换算 |

## 2. 测试环境

| 项 | 值 |
|---|---|
| GPU | NVIDIA GeForce RTX 5060 Ti 16 GB，Blackwell sm_120 |
| PyTorch | 2.11.0+cu128 |
| transformers | 4.57.1 |
| 权重 | BF16 |
| 注意力 | SDPA |
| 输入 | iPhone 8 截图，原图 750×1334，长边缩放 |
| 生成 | LocateAnything 自定义 hybrid 路径，batch=1 |
| 计时 | 每张预热后重复 10 次，取中位 |

首轮在 Windows/WSL 的 SDPA 结果接近。生产系统仍锁 Ubuntu 24.04，但不能把“换 Linux”当作自动提速保证。

## 3. 768 原始结果

| 截图 | 单目标指令 | 中位延迟 | 结果 |
|---|---|---:|---|
| IMG_0001 | close button X | 438.5 ms | 命中 |
| IMG_0002 | close button X below the card | 477.1 ms | 命中，中心与人工标注偏差 <0.2% |
| IMG_0003 | like heart of first comment | 474.1 ms | 命中 |
| IMG_0007 | close X at top-left of bottom sheet | 507.7 ms | 命中，中心与人工标注偏差 <0.2% |
| IMG_0008 | Don't Allow button | 475.0 ms | 命中 |
| comment | like button on right rail | 513.6 ms | 命中 |
| location-comment | cancel/dismiss button | 478.3 ms | 命中 |
| location-popup | cancel/dismiss button | 477.2 ms | 命中 |
| search-result | like button on right rail | 607.5 ms | 命中 |
| stream-video | 旧用例把业务目标写错 | 不计精度结论 |

有效样本延迟约为：min 438 ms / median 477 ms / max 608 ms。

`stream-video` 的业务目标应是直播标记，而不是点赞按钮；它属于测试定义错误，不能算模型失败或成功。

## 4. 分辨率结论

### 768

- 有效样本精度达标；
- 单流约 2.1 张/秒；
- 当前最可靠的精度对照档。

### 512

- 单流约 3.57 张/秒；
- `IMG_0002` 中约 15px 的促销关闭键发生偏移并可能点空；
- 因小目标风险，不作为生产档。

### 640

640 是当前生产默认值，但首轮基准没有形成完整 640 样本结论。上线前必须按 [`真机部署手册.md`](真机部署手册.md) 在真实 TikTok/iOS 页面逐个验关键 Target；小关闭键不稳就将 perception 改为 768 复测。

## 5. 吞吐与容量边界

当前只能使用 batch=1。不要再把以下能力计入容量：

- 多目标组合请求；
- batch 4/8；
- vLLM/TensorRT-LLM 自动兼容自定义 grounding generate；
- FP8 或 flash-attn 的假设倍数；
- “一张卡带 100–200 台”。

裸卡估算公式：

```text
可带手机数 ≈ 单卡实测吞吐 × 单台平均 VLM 调用间隔 × 0.6 余量
```

以 768 的 2.1 张/秒、单台约 7–8 秒一次 VLM 调用计算，约为 9–10 台。这只是规划起点；真实容量必须用当前三个工作流测到的调用频率、P95 延迟、失败重试和队列长度重新计算。

几百台部署应按多卡分片设计，不得先按在线手机数静态除以 10 后直接采购；先从 1 台、2 台、小批量压测逐级放大。

## 6. 当前不采用的优化

- **FP8**：当前 Blackwell 软件栈未得到可复现的精度与吞吐收益，不进入生产基线。
- **flash-attn**：当前自定义模型路径没有形成可复现收益，生产使用 SDPA。
- **多实例**：会重复占用权重和显存，未测出稳定收益前不作为容量依据。
- **批处理**：模型运行路径已确认 batch=1，不再保留复测 runbook。

以后若软件栈变化，必须在独立分支重新跑基准、逐图核框并记录完整环境；新结果验证前不得修改本报告的生产结论。

## 7. 复现实测

在能运行 LocateAnything 的 Ubuntu 24.04 环境：

```bash
cd bench/locateanything

python bench.py \
  --model /opt/models/LocateAnything-3B \
  --images shots \
  --runs 10 \
  --attn sdpa \
  --max-side 768 \
  --out out-768
```

再分别运行 640、512 对照：

```bash
python bench.py --model /opt/models/LocateAnything-3B --images shots --runs 10 --attn sdpa --max-side 640 --out out-640
python bench.py --model /opt/models/LocateAnything-3B --images shots --runs 10 --attn sdpa --max-side 512 --out out-512
```

每轮必须保存：

- 完整终端日志；
- GPU、驱动、PyTorch、CUDA、transformers 版本；
- `boxed_*` 输出图；
- 每张延迟与总体中位数；
- 小目标是否命中；
- 与 768 基线的差异。

## 8. 验证边界

本报告证明的是固定样本上的单目标定位可行性和单流性能，不证明：

- 当前 TikTok 版本全部 Target 都能命中；
- 640 已完成真机验收；
- 多台并发时仍保持同样延迟；
- 长时间运行无显存/队列问题；
- 一张 5060 Ti 的生产承载已经定案。

部署与真机验收以 [`真机部署手册.md`](真机部署手册.md) 和 [`真机联调-checklist.md`](真机联调-checklist.md) 为准。
