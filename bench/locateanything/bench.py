#!/usr/bin/env python3
"""
LocateAnything-3B 在 RTX 5060 Ti 上、iPhone 8(750x1334)截图上的 grounding 实测。
产出决定承载量的唯一硬指标：单张延迟(ms) → 吞吐(img/s) → 单卡能带多少台手机。

用法：
  python bench.py --model ./LocateAnything-3B --images "shots/*.PNG" --runs 10 --out out

读数：看末尾打印的「中位延迟 / 吞吐 / 承载量表」；到 out/ 里看画了框的图核对定位准不准。
"""
import argparse, glob, os, re, statistics, time
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")  # 减碎片，须在 import torch 前
import torch
from PIL import Image, ImageDraw
from transformers import AutoModel, AutoTokenizer, AutoProcessor

# 按截图文件名给对应的定位指令（核对精度用）。命不中就用 --prompt 默认值。
# 你仓库 apps/mobile/adaptation/screenshots 里的样本正好覆盖这些目标。
CASES = {
    "IMG_0008": "the Don't Allow button",
    "IMG_0007": "the close button X at the top-left of the bottom sheet",
    "IMG_0002": "the close button X below the card",
    "IMG_0003": "the like heart icon of the first comment",
    "IMG_0001": "the close button X",
    "location": "the cancel or dismiss button",
}
BOX_RE = re.compile(r"<box><(\d+)><(\d+)><(\d+)><(\d+)></box>")


def prompt_for(path, default):
    name = os.path.basename(path)
    for k, v in CASES.items():
        if k in name:
            return v
    return default


def collect_images(spec):
    """spec 可以是目录，或逗号分隔的多个 glob。大小写不敏感（Linux/WSL 上 *.PNG 会漏 .png）。"""
    exts = ("png", "PNG", "jpg", "JPG", "jpeg", "JPEG")
    out = []
    if os.path.isdir(spec):
        for e in exts:
            out += glob.glob(os.path.join(spec, f"*.{e}"))
    else:
        for pat in spec.split(","):
            out += glob.glob(pat)
    return sorted(set(out))


@torch.no_grad()  # 关键：不建反向图，否则每次前向都累积显存 → OOM
def ground(model, tokenizer, processor, image, phrase, max_new_tokens, max_side=0):
    if max_side and max(image.size) > max_side:  # 缩长边降显存/提速（归一化框坐标不受影响）
        s = max_side / float(max(image.size))
        image = image.resize((max(1, round(image.width * s)), max(1, round(image.height * s))))
    messages = [{"role": "user", "content": [
        {"type": "image", "image": image},
        {"type": "text", "text": f"Locate the region that matches: {phrase}."},
    ]}]
    text = processor.py_apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    images, videos = processor.process_vision_info(messages)
    inputs = processor(text=[text], images=images, videos=videos, return_tensors="pt").to("cuda")
    resp = model.generate(
        pixel_values=inputs["pixel_values"].to(torch.bfloat16),
        input_ids=inputs["input_ids"],
        attention_mask=inputs["attention_mask"],
        image_grid_hws=inputs.get("image_grid_hws", None),  # MoonViT 网格尺寸，缺了视觉模型 forward 会崩
        tokenizer=tokenizer,
        max_new_tokens=max_new_tokens,
        use_cache=True,          # 模型自定义 generate 强制要求
        generation_mode="hybrid",
        temperature=0.7,
        do_sample=True,
        top_p=0.9,
        repetition_penalty=1.1,
        verbose=False,           # 别逐步刷屏（官方默认 True）
    )
    ans = resp[0] if isinstance(resp, tuple) else resp  # 模型可能返回 (answer, history, stats)
    return ans if isinstance(ans, str) else str(ans)


def timed(fn):
    torch.cuda.synchronize()
    t0 = time.perf_counter()
    out = fn()
    torch.cuda.synchronize()
    return out, (time.perf_counter() - t0) * 1000.0  # ms


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="./LocateAnything-3B")
    ap.add_argument("--images", required=True, help='目录（如 shots）或逗号分隔 glob（如 "shots/*.PNG,shots/*.png"）')
    ap.add_argument("--runs", type=int, default=10, help="每张图计时次数（取中位）")
    ap.add_argument("--max-new-tokens", type=int, default=64, help="单框输出很短，压小提速；官方默认 2048 是浪费")
    ap.add_argument("--prompt", default="the like button (heart icon) on the right rail")
    ap.add_argument("--attn", default=None, help='attn 实现，如 sdpa/eager；原生 Windows 无 flash-attn 时可试 sdpa')
    ap.add_argument("--max-side", type=int, default=0, help="把图长边缩到这个像素再喂（0=原图）；显存不够(OOM)时设 1000/768")
    ap.add_argument("--out", default="out")
    args = ap.parse_args()

    paths = collect_images(args.images)
    if not paths:
        raise SystemExit(f"没找到图片：{args.images}")
    os.makedirs(args.out, exist_ok=True)

    print(f"torch {torch.__version__} | GPU {torch.cuda.get_device_name(0)} | "
          f"cap {torch.cuda.get_device_capability(0)}")
    print(f"加载模型 {args.model} …")
    tokenizer = AutoTokenizer.from_pretrained(args.model, trust_remote_code=True)
    processor = AutoProcessor.from_pretrained(args.model, trust_remote_code=True)
    mk = dict(torch_dtype=torch.bfloat16, trust_remote_code=True)
    if args.attn:
        mk["attn_implementation"] = args.attn
    model = AutoModel.from_pretrained(args.model, **mk).to("cuda").eval()

    # 预热（首次含 CUDA/kernel 编译，不计入）。
    warm = Image.open(paths[0]).convert("RGB")
    print(f"样本分辨率示例：{warm.size}（应为 750x1334 或其转置）")
    for _ in range(2):
        ground(model, tokenizer, processor, warm, args.prompt, args.max_new_tokens, args.max_side)
    torch.cuda.empty_cache()
    torch.cuda.reset_peak_memory_stats()

    all_ms = []
    with torch.inference_mode():
        for p in paths:
            img = Image.open(p).convert("RGB")
            phrase = prompt_for(p, args.prompt)
            ms_list, last = [], ""
            for _ in range(args.runs):
                last, ms = timed(lambda: ground(model, tokenizer, processor, img, phrase, args.max_new_tokens, args.max_side))
                ms_list.append(ms)
            med = statistics.median(ms_list)
            all_ms.append(med)
            boxes = BOX_RE.findall(last)
            # 画框核对精度（归一化 0-1000 → 像素）。
            draw = ImageDraw.Draw(img)
            W, H = img.size
            for (x1, y1, x2, y2) in boxes:
                x1, y1, x2, y2 = int(x1)/1000*W, int(y1)/1000*H, int(x2)/1000*W, int(y2)/1000*H
                draw.rectangle([x1, y1, x2, y2], outline=(255, 0, 0), width=4)
            img.save(os.path.join(args.out, "boxed_" + os.path.basename(p)))
            print(f"  {os.path.basename(p):22s} {W}x{H} | 「{phrase}」 | 中位 {med:7.1f} ms | 框 {boxes}")

    med = statistics.median(all_ms)
    ips = 1000.0 / med
    peak_gb = torch.cuda.max_memory_allocated() / 1e9
    print("\n==== 结果 ====")
    print(f"整体单张中位延迟：{med:.1f} ms  →  单流吞吐 ≈ {ips:.2f} 张/秒（batch1）")
    print(f"峰值显存：{peak_gb:.2f} GB / 16 GB")
    print("\n单卡承载量估算（phones ≈ 吞吐 × 每台两次 VLM 调用间隔 × 0.6 余量）：")
    print(f"{'每台调用间隔':>14} | {'用法':>16} | {'可带手机数':>10}")
    for T, use in [(4, "纯VLM每步(下限)"), (5, "纯VLM每步(上限)"), (30, "混合·兜底"), (60, "混合·稀疏兜底")]:
        print(f"{T:>12}s | {use:>16} | {ips*T*0.6:>9.0f} 台")
    print("\n注：batch1 是保守值；真实服务用 vLLM/TensorRT-LLM 批处理 + Blackwell FP8，吞吐更高。")


if __name__ == "__main__":
    main()
