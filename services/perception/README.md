# services/perception — LocateAnything HTTP 感知服务

把 LocateAnything-3B 包成 **OpenAI 兼容** `/v1/chat/completions` 端点。`@auto/perceptor-vlm` 的 OpenAI 后端直连它,远程/本地同一套。推理逻辑与 `bench/locateanything/bench.py` 的 `ground()` 一致(已被 bench 验证能出 `<box>`)。

## 为什么不用 vLLM
LocateAnything 自定义架构(MoonViT + Parallel Box Decoding + 自定义 `generate`、只支持 batch=1),vLLM 未必认。本服务薄薄一层 transformers + FastAPI,最稳。

## 在 GPU 机上跑(你 bench 那台 Linux)

```bash
# 1) 进 bench 的 venv(torch/transformers/decord/lmdb/torchvision 已装),补三个包
source la3b/bin/activate           # 或你 bench 用的那个 venv
pip install -r requirements.txt

# 2) 起服务(模型路径同 bench;640/0.8 是默认值,写出来只为显式)
python server.py --model ./LocateAnything-3B --attn sdpa --max-side 640 --temperature 0.8 --host 0.0.0.0 --port 8000
#   显存紧/想提速:加 --fp8(务必之后用冒烟工具复核坐标没塌)
```

## 自检

```bash
curl http://localhost:8000/health
# {"ok":true,"max_side":640}

# 模拟一次 grounding(把 <BASE64> 换成一张截图的 base64):
curl -s http://localhost:8000/v1/chat/completions -H 'Content-Type: application/json' -d '{
  "model":"la3b","max_tokens":64,
  "messages":[{"role":"user","content":[
    {"type":"text","text":"Locate the region that matches: the like heart button. Output \"<box><x1><y1><x2><y2></box>\" 0-1000, or none."},
    {"type":"image_url","image_url":{"url":"data:image/png;base64,<BASE64>"}}
  ]}]}'
# 期望 choices[0].message.content 含 <box>…</box>
```

## 契约(与 perceptor-vlm 对齐)
- 请求:标准 OpenAI chat/completions,`content` 为 `[{type:text,text},{type:image_url,image_url:{url:"data:image/png;base64,…"}}]`。
- `text` 是**完整指令**(perceptor-vlm 的 protocol.ts 已拼好,如 `Locate the region that matches: X. …`),服务原样喂模型,**不再包装**。
- 响应:`choices[0].message.content` = 模型原始文本(含 `<box>`),解析在客户端。
- 并发:单 worker 线程池串行化推理(batch=1 现实);多台手机请求会排队。

## 注意
- `--max-side 640`:2026-07-20 拍板的生产分辨率(`docs/决策记录-2026-07-20.md` D6)。精度实测仅覆盖 768(十张全准)/512(miss shop 小 ✕);640 靠真机逐目标验收顺带实测,**小目标不稳就回 `--max-side 768`**。
- FP8 只量化 LLM 解码层、排除视觉塔(否则坐标崩)——与 bench 同纪律。启用后**必复核坐标**。
- 采样温度默认 0.8(拍板「稍调高」,P1/P2;请求体 `temperature` 可逐次覆盖)。**bench 全部精度数据在 0.7 下测得**,更高温度坐标 run-to-run 抖动更大——真机验收时对比 0.7/0.8 再锁定;要更稳可后续试 `do_sample=False`(需确认模型 generate 接受)。
