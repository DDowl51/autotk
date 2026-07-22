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
    # 直播卡：识别「直播中/LIVE」徽标 → 判定直播 → 直接划走（不是找点赞键）
    "stream-video": 'the "直播中" (LIVE) badge label',
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


def _prep_image(image, max_side):
    if max_side and max(image.size) > max_side:
        s = max_side / float(max(image.size))
        return image.resize((max(1, round(image.width * s)), max(1, round(image.height * s))))
    return image


@torch.no_grad()  # 最佳努力批处理：多图一批喂 processor+generate，测批处理吞吐乘数（当前最不确定的量）。
def ground_batch(model, tokenizer, processor, images, phrases, max_new_tokens, max_side=0):
    msgs = [[{"role": "user", "content": [
        {"type": "image", "image": _prep_image(im, max_side)},
        {"type": "text", "text": f"Locate the region that matches: {ph}."},
    ]}] for im, ph in zip(images, phrases)]
    texts = [processor.py_apply_chat_template(m, tokenize=False, add_generation_prompt=True) for m in msgs]
    imgs = []
    for m in msgs:
        ii, _ = processor.process_vision_info(m)
        imgs += ii
    inputs = processor(text=texts, images=imgs, videos=None, return_tensors="pt", padding=True).to("cuda")
    return model.generate(
        pixel_values=inputs["pixel_values"].to(torch.bfloat16),
        input_ids=inputs["input_ids"],
        attention_mask=inputs["attention_mask"],
        image_grid_hws=inputs.get("image_grid_hws", None),
        tokenizer=tokenizer,
        max_new_tokens=max_new_tokens,
        use_cache=True, generation_mode="hybrid",
        temperature=0.7, do_sample=True, top_p=0.9, repetition_penalty=1.1, verbose=False,
    )


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
    # 默认 sdpa：模型 config 默认 attn 是 "magi"，magi 包没装时会去够它；显式 sdpa 走保证路。
    # 装了 flash-attn 轮子后传 --attn flash_attention_2 对比。
    ap.add_argument("--attn", default="sdpa", help='attn 实现：sdpa(默认,保证跑) / flash_attention_2(装了轮子后测) / eager')
    ap.add_argument("--max-side", type=int, default=0, help="把图长边缩到这个像素再喂（0=原图）；显存不够(OOM)时设 1000/768")
    ap.add_argument("--batch", type=int, default=1, help="批处理张数：>1 则测批处理吞吐（最不确定的量）而非逐张精度")
    ap.add_argument("--fp8", action="store_true", help="用 torchao 把 LLM 解码层量化到 FP8（Blackwell 原生；已排除视觉塔/box 头，须复核精度）")
    ap.add_argument("--fp8-mode", choices=("dynamic", "weight"), default="dynamic",
                    help="dynamic=动态激活+权重(PerRow,sm_120 上真提速)；weight=只权重(精度最稳但 batch1 几乎不提速)")
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

    if args.fp8:
        # torchao 把 LLM 解码层的 nn.Linear 量化到 FP8（Blackwell 原生）。两条硬纪律（调研得出）：
        #  1) 必须 filter_fn 排除视觉塔(MoonViT)/projector/box 头/lm_head/embed——量化视觉塔是
        #     grounding 坐标(IoU)崩塌的最常见原因，坐标精度全靠这些层。
        #  2) dynamic 模式在 sm_120 上必须 kernel_preference=TORCH（走 torch._scaled_mm，≈2.5×BF16）；
        #     默认 AUTO 会静默退到「反量化再 BF16 matmul」的慢路 → FP8 反而不快（同速或更慢）。
        # 量化后务必看 out/boxed_* 复核坐标没塌（本脚本自动画框）。weight 模式精度最稳但 batch1 几乎不提速。
        try:
            from torchao.quantization import quantize_
            SKIP = ("vision", "visual", "moonvit", "vit", "projector", "merger", "mlp1",
                    "lm_head", "embed", "box", "mtp", "pbd", "head")
            def only_llm_linears(module, fqn):
                return isinstance(module, torch.nn.Linear) and not any(s in fqn.lower() for s in SKIP)
            if args.fp8_mode == "weight":
                from torchao.quantization import Float8WeightOnlyConfig
                cfg = Float8WeightOnlyConfig()
            else:
                from torchao.quantization import Float8DynamicActivationFloat8WeightConfig, PerRow
                kwargs = dict(granularity=PerRow())
                try:  # KernelPreference 导入路径随 torchao 版本变；取不到就不传（可能走慢路，会提示）
                    from torchao.quantization.quantize_.common.kernel_preference import KernelPreference
                    kwargs["kernel_preference"] = KernelPreference.TORCH
                except Exception:
                    print("⚠ 取不到 KernelPreference.TORCH；sm_120 上 FP8 dynamic 可能走慢路（同速/更慢），升级 torchao 再试")
                cfg = Float8DynamicActivationFloat8WeightConfig(**kwargs)
            quantize_(model, cfg, filter_fn=only_llm_linears)
            print(f"已应用 torchao FP8：{type(cfg).__name__}（仅 LLM 解码层，已排除视觉塔/box 头）")
        except Exception as e:
            print(f"⚠ FP8 量化失败，退回 BF16：{e}")

    def vram():
        return torch.cuda.memory_allocated() / 1e9

    print(f"模型驻留显存：{vram():.2f} GB")

    # —— 批处理吞吐模式（--batch > 1）：取样本前 N 张（不足循环补），批量推理计时 ——
    if args.batch > 1:
        sel = (paths * args.batch)[: args.batch]
        imgs = [Image.open(p).convert("RGB") for p in sel]
        phrases = [prompt_for(p, args.prompt) for p in sel]
        try:
            with torch.inference_mode():
                ground_batch(model, tokenizer, processor, imgs, phrases, args.max_new_tokens, args.max_side)  # 预热
                torch.cuda.empty_cache(); torch.cuda.reset_peak_memory_stats()
                tl = []
                for _ in range(5):
                    _, ms = timed(lambda: ground_batch(model, tokenizer, processor, imgs, phrases, args.max_new_tokens, args.max_side))
                    tl.append(ms)
        except Exception as e:
            raise SystemExit(f"批处理不被该模型 generate 支持（{e}）\n→ 改用 vLLM/TensorRT-LLM 测批处理，或 --batch 1 单流。")
        med = statistics.median(tl)
        peak = torch.cuda.max_memory_allocated() / 1e9
        print(f"\n==== 批处理 batch={args.batch} max_side={args.max_side or '原图'} ====")
        print(f"整批中位延迟：{med:.1f} ms  →  吞吐 ≈ {args.batch * 1000.0 / med:.2f} 张/秒 | 峰值显存 {peak:.2f} GB")
        return

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
            W, H = img.size
            # 先打印（延迟+框），确保关键数据一定可见，画框失败也不影响。
            print(f"  {os.path.basename(p):22s} {W}x{H} | 「{phrase}」 | 中位 {med:7.1f} ms | 框 {boxes}")
            # 画框核对精度（归一化 0-1000 → 像素）。min/max 排序，模型返回顺序反了也不崩。
            try:
                draw = ImageDraw.Draw(img)
                for (a, b, c, d) in boxes:
                    xs = sorted([int(a) / 1000 * W, int(c) / 1000 * W])
                    ys = sorted([int(b) / 1000 * H, int(d) / 1000 * H])
                    draw.rectangle([xs[0], ys[0], xs[1], ys[1]], outline=(255, 0, 0), width=4)
                img.save(os.path.join(args.out, "boxed_" + os.path.basename(p)))
            except Exception as e:
                print(f"    (画框跳过：{e})")

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
