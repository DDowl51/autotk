# services/master — 运行时 + 单机冒烟

装配 `@auto/core + driver-ios-wda + perceptor-vlm + plugin-tiktok` 成真运行时。目前先有**单机冒烟工具**,验证真机链路;多机编排(Fleet + Postgres StateStore + Hub 对接)随后加。

## 冒烟:验证「截图 → VLM 定位 → 点」整条链在真机上通

前置(你那边就绪):
1. iPhone 8 上 WDA 跑着(浏览器访问 `http://<手机IP>:8100/status` 有响应),TikTok 前台。
2. GPU 机上 `services/perception` 起着(`curl http://<GPU机IP>:8000/health` 返回 ok)。
3. 驱动电脑到这两个地址都通。

跑(把 TikTok 停在**能看到点赞键**的视频页):

```bash
pnpm install    # 首次
WDA_URL=http://<手机IP>:8100 VLM_URL=http://<GPU机IP>:8000 pnpm --filter @mc/master smoke
```

- 默认只**定位并报坐标**,把截图存 `smoke-shot.png`,对照看框准不准。
- 加 `TAP=1` 真点那个坐标(看手机是否点中)。
- `TARGET=feed.like-off`(注册表 id)或 `TARGET="the close button X"`(英文短语)换目标。
- `VLM_MODEL=<名>` 若你的服务要求特定 model 名。

```bash
# 例:定位「未点赞的白心」并真点
WDA_URL=http://192.168.1.50:8100 VLM_URL=http://192.168.1.9:8000 TARGET=feed.like-off TAP=1 pnpm --filter @mc/master smoke
```

## 读结果
- `✅ 命中 … 像素中心 (x, y)` + `smoke-shot.png`:打开图看那个坐标是不是压在目标上 → grounding 准不准。
- `TAP=1` 时看手机真机点没点中。
- `❌ 未定位到`:目标不在当前屏 / **组合指令格式模型不吃**(改 `packages/perceptor-vlm/src/protocol.ts`,单一真源)/ region 先验过滤掉了。

## 联调顺序(便宜→贵)
1. **本冒烟**(单目标 find+tap):链路通 + 单目标精度。
2. 逐个验注册表关键目标(×/Don't Allow/白心/评论头像…):`TARGET=<id>` 挨个跑。
3. 组合多目标(每步一次问多个):这是 `protocol.ts` 里 `buildLocateInstruction` 的格式,**真机第一个要调的点**(模型对组合格式的服从度未验)。
4. 单工作流(search)→ 多机 Fleet。
