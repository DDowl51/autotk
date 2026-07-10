#!/usr/bin/env python3
"""
感知服务:把 LocateAnything-3B 包成 OpenAI 兼容的 /v1/chat/completions 端点。
@auto/perceptor-vlm 的 OpenAI 后端直接连它(远程/本地同一套)。推理逻辑 1:1 复用 bench.py 的 ground()。

为什么不用 vLLM:LocateAnything 是自定义架构(MoonViT + PBD + 自定义 generate、只支持 batch=1),
vLLM 未必认。此服务薄薄一层 transformers + FastAPI,已被 bench 验证能出 <box>。

跑法(GPU 机,bench 那个 venv 里 + pip install fastapi uvicorn):
  python server.py --model ./LocateAnything-3B --attn sdpa --max-side 768 --host 0.0.0.0 --port 8000
  # 显存紧/想提速再加 --fp8（务必之后复核坐标没塌）

自检:
  curl http://localhost:8000/health
"""
import argparse
import asyncio
import base64
import io
import re
import time
from concurrent.futures import ThreadPoolExecutor

import torch
from PIL import Image
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn
from transformers import AutoModel, AutoProcessor, AutoTokenizer

DATA_URI_RE = re.compile(r"^data:(?P<mime>[^;]+);base64,(?P<b64>.+)$", re.DOTALL)

# —— 全局(启动时装一次)——
STATE = {}


def load_model(args):
    print(f"torch {torch.__version__} | GPU {torch.cuda.get_device_name(0)} | cap {torch.cuda.get_device_capability(0)}")
    print(f"加载模型 {args.model} …")
    tokenizer = AutoTokenizer.from_pretrained(args.model, trust_remote_code=True)
    processor = AutoProcessor.from_pretrained(args.model, trust_remote_code=True)
    mk = dict(torch_dtype=torch.bfloat16, trust_remote_code=True)
    if args.attn:
        mk["attn_implementation"] = args.attn
    model = AutoModel.from_pretrained(args.model, **mk).to("cuda").eval()

    if args.fp8:
        # 与 bench.py 同纪律:只量化 LLM 解码层 nn.Linear,排除视觉塔/projector/box 头(否则坐标崩)。
        # weight-only 精度最稳(batch1 提速有限);dynamic 提速大但需 sm_120 kernel_preference=TORCH。
        from torchao.quantization import quantize_, Float8WeightOnlyConfig
        SKIP = ("vision", "visual", "moonvit", "vit", "projector", "merger", "mlp1",
                "lm_head", "embed", "box", "mtp", "pbd", "head")

        def only_llm_linears(module, fqn):
            return isinstance(module, torch.nn.Linear) and not any(s in fqn.lower() for s in SKIP)

        quantize_(model, Float8WeightOnlyConfig(), filter_fn=only_llm_linears)
        print("已应用 FP8(weight-only,排除视觉塔)——务必复核坐标精度")

    STATE.update(tokenizer=tokenizer, processor=processor, model=model, max_side=args.max_side)
    print(f"就绪:max_side={args.max_side} attn={args.attn} fp8={args.fp8}")


@torch.no_grad()
def infer(image: Image.Image, instruction: str, max_new_tokens: int) -> str:
    """1:1 复用 bench.ground(),但 text 直接用调用方传来的完整 instruction(不再包 'Locate...')。"""
    max_side = STATE["max_side"]
    if max_side and max(image.size) > max_side:
        s = max_side / float(max(image.size))
        image = image.resize((max(1, round(image.width * s)), max(1, round(image.height * s))))
    processor, tokenizer, model = STATE["processor"], STATE["tokenizer"], STATE["model"]
    messages = [{"role": "user", "content": [
        {"type": "image", "image": image},
        {"type": "text", "text": instruction},
    ]}]
    text = processor.py_apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    imgs, videos = processor.process_vision_info(messages)
    inputs = processor(text=[text], images=imgs, videos=videos, return_tensors="pt").to("cuda")
    resp = model.generate(
        pixel_values=inputs["pixel_values"].to(torch.bfloat16),
        input_ids=inputs["input_ids"],
        attention_mask=inputs["attention_mask"],
        image_grid_hws=inputs.get("image_grid_hws", None),
        tokenizer=tokenizer,
        max_new_tokens=max_new_tokens,
        use_cache=True, generation_mode="hybrid",
        temperature=0.7, do_sample=True, top_p=0.9, repetition_penalty=1.1, verbose=False,
    )
    ans = resp[0] if isinstance(resp, tuple) else resp
    return ans if isinstance(ans, str) else str(ans)


def extract(messages):
    """从 OpenAI messages 取(instruction 文本, PIL 图)。取最后一条 user 消息。"""
    instruction, image = "", None
    for msg in messages:
        if msg.get("role") != "user":
            continue
        content = msg.get("content")
        if isinstance(content, str):
            instruction = content
            continue
        for part in content or []:
            if part.get("type") == "text":
                instruction = part.get("text", "")
            elif part.get("type") == "image_url":
                url = (part.get("image_url") or {}).get("url", "")
                m = DATA_URI_RE.match(url)
                if not m:
                    raise HTTPException(400, "image_url 必须是 data:*;base64, 内联图")
                image = Image.open(io.BytesIO(base64.b64decode(m.group("b64")))).convert("RGB")
    if image is None:
        raise HTTPException(400, "消息里没有图片")
    return instruction, image


app = FastAPI()
# GPU 单流(batch=1 现实):单 worker 线程池串行化推理,不阻塞事件循环。
_pool = ThreadPoolExecutor(max_workers=1)


class ChatReq(BaseModel):
    model: str | None = None
    messages: list
    max_tokens: int | None = None
    temperature: float | None = None


@app.get("/health")
def health():
    return {"ok": "model" in STATE, "max_side": STATE.get("max_side")}


@app.post("/v1/chat/completions")
async def chat(req: ChatReq):
    instruction, image = extract(req.messages)
    max_new = req.max_tokens or 128
    loop = asyncio.get_event_loop()
    content = await loop.run_in_executor(_pool, infer, image, instruction, max_new)
    return {
        "id": f"chatcmpl-{int(time.time()*1000)}",
        "object": "chat.completion",
        "model": req.model or "locateanything-3b",
        "choices": [{"index": 0, "message": {"role": "assistant", "content": content}, "finish_reason": "stop"}],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="./LocateAnything-3B")
    ap.add_argument("--attn", default="sdpa")
    ap.add_argument("--max-side", type=int, default=768)
    ap.add_argument("--fp8", action="store_true")
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--port", type=int, default=8000)
    args = ap.parse_args()
    load_model(args)
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
