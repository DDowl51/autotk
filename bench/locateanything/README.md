# LocateAnything-3B 基准复现

这里的脚本用于复现固定 iPhone 8 截图上的单目标 grounding 延迟与坐标，不是生产服务入口。当前结论见 [`../../docs/LocateAnything-3B-5060Ti-性能报告.md`](../../docs/LocateAnything-3B-5060Ti-性能报告.md)。

## 当前约束

- 生产环境基线是 Ubuntu 24.04、BF16、SDPA；
- 模型一次只查询一个目标；
- 当前运行路径只支持 batch=1；
- 不把 FP8、flash-attn、批处理或多实例的假设收益计入容量；
- 768 是精度对照档，生产默认 640 必须随真机逐目标验收，512 已知会丢小关闭键。

## 环境

```bash
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install -U pip wheel

pip install "torch==2.11.0" "torchvision==0.26.0" --index-url https://download.pytorch.org/whl/cu128
pip install "transformers==4.57.1" accelerate \
  "opencv-python-headless==4.11.0.86" \
  "Pillow==11.1.0" "huggingface_hub<1.0" decord lmdb
```

确认 GPU 真能执行算子：

```bash
python -c 'import torch; print(torch.__version__); assert torch.cuda.is_available(); print(torch.zeros(3).cuda())'
```

模型放到稳定目录，例如 `/opt/models/LocateAnything-3B`。不要把模型或输出目录提交到仓库。

## 运行

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

分辨率对照：

```bash
python bench.py --model /opt/models/LocateAnything-3B --images shots --runs 10 --attn sdpa --max-side 640 --out out-640
python bench.py --model /opt/models/LocateAnything-3B --images shots --runs 10 --attn sdpa --max-side 512 --out out-512
```

## 判定

不要只看平均延迟。每轮都要打开 `out-*/boxed_*`，尤其检查：

- 促销卡下方小关闭键；
- 内嵌网页左上关闭键；
- `Don't Allow`；
- 评论区点赞；
- 右侧动作栏点赞。

`stream-video` 的旧用例曾把直播卡业务目标写成点赞按钮；修改 CASE 时要验证目标定义本身，不要把错误用例算成模型失败。

反馈新结果时附：

- GPU/OS/驱动；
- PyTorch/CUDA/transformers；
- 完整命令；
- 完整日志；
- boxed 输出图；
- 每张延迟；
- 640 与 768 的小目标差异。
