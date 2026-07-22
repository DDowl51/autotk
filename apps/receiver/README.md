# apps/receiver — 收视频端(2.0 发布链路 W2b)

极小 iOS App:**连 master → 后台保活 → 收下载命令 → 下载视频存相册 → 回报进度**。
2.0 发布链路的手机侧(D9);养号/发布 UI 全由 master 经 WDA 驱动,本 App 只做"哑文件槽"。

> 抢救自旧 autotk 的 `downloader.ts`/`album.ts`(去掉 on-device 发布步)。旧引擎已退役(D8),本 App 无 OCR/无定位决策。

## 架构(纯逻辑可测 / RN 外壳 Mac 构建)

| 文件 | 层 | 测试 |
|---|---|---|
| `src/agent.ts` | **核心**:收 download 命令→下载→回报进度,去重+失败可重试 | ✅ vitest |
| `src/downloader.ts` | **纯**:下载+存相册(注入 saveUrlToAlbum) | ✅ vitest |
| `src/protocol.ts` | master↔端 内部协议(**vendored,与 `services/master/src/receiver/protocol.ts` 同步**) | — |
| `src/album.ts` | RN:expo-file-system 流式下载 + expo-media-library 存相册 | 真机 |
| `src/socketClient.ts` | RN:socket.io-client 连 master、hello、收命令、回进度 | 真机 |
| `src/keepalive.ts` | RN:expo-location 始终定位后台保活(β1 命脉) | 真机 |
| `App.tsx` | RN:装配 + 大字状态 UI(供人眼 + master 的 VLM 读) | 真机 |

## 跑测试

```bash
# 本机(未装本包 → 借已装 vitest 的包上下文):
pnpm --filter @mc/master exec vitest run --root apps/receiver
# Mac(装了本包后):
cd apps/receiver && pnpm install && pnpm test
```

## Mac 构建 + 装机

```bash
cd apps/receiver
pnpm install
npx tsc --noEmit          # 类型检查
npx expo prebuild --platform ios
# 出未签名 ipa → 走装机台重签,或 EAS/Xcode 构建
```

装机时每台配:
- `EXPO_PUBLIC_MASTER_URL`(master 收视频通道,如 `http://<GPU机IP>:4610`)
- `EXPO_PUBLIC_UDID`(本机 udid = Hub 编号,回报/握手用)
- 授权:相册"全部照片" + 定位"始终"(app.json 已声明,系统弹窗需手点授予)

## 与 master 的接口

- 端 → master:`receiver:hello {udid}`(上线)、`receiver:progress {taskId,status,assetId?,error?}`
- master → 端:`receiver:download {taskId,url,videoName}`

master 侧见 `services/master/src/receiver/`;完整链路见 `docs/设计-管理中心对接与发布链路.md`。
