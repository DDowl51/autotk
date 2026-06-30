# src/publish — 阶段3 发布接收侧

手机端「收到发布任务 → 下载视频入相册 → 在 TikTok 发布 → 回报状态」。

- `downloader.ts` —— `downloadToAlbum(source, videoName, deps)`：从 lan 直链/relay 中转链下载并写相册。纯逻辑，fetch / saveToAlbum 注入。
- `publishQueue.ts` —— `PublishQueue`（去重 + FIFO + 状态）+ `runPublish(task, deps)`（状态机：下载→入相册→发布，逐步回报）。纯逻辑。
- `album.ts` —— RN 侧 `saveBytesToAlbum`（注入给 downloader）。**需两个原生模块**：

```bash
npx expo install expo-file-system expo-media-library
```

接线在 `src/app/useEngine.ts`：HubClient `onPublishTask` → 入队 → 串行 `runPublish`
（download=downloadToAlbum(fetch+saveBytesToAlbum)、publishVideo=TikTokUI.publishVideo、onStatus→reportPublishResult）。

**真机阶段待补**：`TikTokUI.publishVideo()` 的真实实现（onDeviceUI/calibratedUI：标定 TikTok 上传流程坐标）。
现 mockUI 有占位实现，真机未适配时发布任务会报 failed（"本机未适配发布功能"）。

测试：`tests/downloader.test.ts`、`tests/publishQueue.test.ts`（node:test，随 `npm test` 跑）。
