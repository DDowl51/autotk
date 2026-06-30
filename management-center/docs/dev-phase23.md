# 二期剩余（非真机）开发方案 — M4 日志 + 阶段2 批量设置 + 阶段3 文件夹发布（基础设施）

> 范围：把**不依赖真机**的剩余需求全部做完，每个里程碑结束 `npm test` 全绿。
> 真机边界：凡是「在 TikTok 界面上实际操作」的部分（评论调坐标、视频上传 UI）留到手机端阶段，
> 本方案做到「逻辑 + 协议 + Hub + 桌面 + 手机接收侧」可用 mock-device 验证为止。
>
> 现状基线（已存在，勿重写）：
> - `@mc/shared/protocol.ts`：DeviceStatus / DeviceInfo / EVT(device:register|status, devices:snapshot, device:update, operator:hello) / MODULE_LABELS / PAGE_LABELS。
> - Hub：DeviceRegistry（端口-适配器，内存 store）+ gateway（按 handshake.auth.role 分流）+ mock-device。
> - 桌面：hub.ts(operator 连接) + hubState.tsx(context) + devices.ts(reducer) + 6 页。
> - autotk：`src/hub/`(protocol/reporter(LogBuffer 已实现)/client(HubClient 已能发 device:log、收 logs:wanted)/config/deviceName)。
>   **autotk 发日志这端已就绪，Hub 还没接**——M4 就是补上 Hub + 桌面这两端。

---

## 里程碑顺序与理由

1. **M4 手机日志面板**（最小、自洽，手机端已就绪）→ 先做，快速闭环。
2. **阶段2 批量配置下发**（中等，纯数据通路）→ 次之。
3. **阶段3 文件夹发布·基础设施**（最大，含 LAN/中转/调度）→ 最后；发布的「TikTok 上传 UI」用接口+mock 占位，真机阶段再填。

每个里程碑都能用 `mock-device.ts` 端到端验证，不需要手机。

---

## M4 — 手机日志面板（控制中心看手机日志） ✅ 已完成（2026-06-27）

> 实现并测试通过：@mc/shared 加 DeviceLogMsg/DeviceLogsMsg/WatchLogsMsg + EVT.deviceLog/logsWanted/watchLogs/deviceLogs；
> Hub 新增 `domain/log-hub.ts`(LogHub 环形缓冲 cap500 + watcher 集合) 并接进 gateway(device:log 转发给观看者、logs:watch 订阅+回快照+切手机频率、断开自动取消)；
> 桌面新增 `logs.ts`(reducer) + ui.tsx `LogPanel`(等级染色/时间戳/自动滚到底可暂停) + Devices 详情抽屉接入(打开订阅/关闭取消)。
> 测试：Hub 19(LogHub 单测 9 + e2e 日志流 2) + 桌面 19(logs reducer 6) 全绿；`npm run build` 过；
> 真启动冒烟过(hub+mock-device+operator：订阅收快照+实时增量、频率快↔慢切换)。下方为原始设计，保留备查。



**协议（@mc/shared/protocol.ts，与 autotk 现有 vendored 对齐）**
```ts
export interface DeviceLogMsg { level: "info"|"warn"|"error"; msg: string; ts: number; count?: number; }
EVT 增：
  deviceLog:   "device:log"     // 手机→Hub  { lines: DeviceLogMsg[] }
  logsWanted:  "logs:wanted"    // Hub→手机   { on: boolean }  （切上报频率，autotk 已实现接收）
  watchLogs:   "logs:watch"     // 操作员→Hub { deviceId, on }
  deviceLogs:  "device:logs"    // Hub→操作员 { deviceId, lines, replace? }  （replace=快照全量）
```
> autotk vendored protocol 已有 deviceLog/logsWanted；本步把它们提升进 @mc/shared 并补 watchLogs/deviceLogs。改完同步回 autotk/src/hub/protocol.ts（注释已写"保持同步"）。

**Hub（services/hub/src/）**
- 新增 `domain/log-hub.ts`：`LogHub` —— 每台一个环形缓冲（cap 500，复用 autotk LogBuffer 的"合并相邻重复"思路；纯类、可单测）。API：`append(deviceId, lines)` / `snapshot(deviceId)` / `watchers` 集合管理（哪个 operator socket 在看哪台）。
- gateway：
  - device 分支加 `socket.on(deviceLog, ...)` → `logHub.append` → 转发给正在看这台的 operator（`device:logs`）。
  - operator 分支加 `socket.on(watchLogs, {deviceId,on})` → 记录/取消 watcher → 给该 device 下发 `logs:wanted{on}`（切频率）→ on 时先回该台 `device:logs{replace:true, lines: snapshot}`。
  - device/operator 断开时清理 watcher。
- main.ts 注入 LogHub。
- **测试**：`test/log-hub.test.ts`(环形缓冲/合并/cap 单测) + e2e 扩展（device 发 log → 正在 watch 的 operator 收到；watch 开关触发 logs:wanted；快照 replace）。

**桌面（apps/desktop/src/）**
- `hub.ts`：HubHandlers 加 `deviceLogs(deviceId, lines, replace)`；导出 `watchLogs(socket, deviceId, on)`。
- `hubState.tsx`：state 加 `logs: Record<deviceId, DeviceLogMsg[]>`（按 deviceId 存，cap 同 500）；打开/关闭详情时 watchLogs on/off。
- `pages/Devices.tsx` 详情 Drawer：加「日志」区 —— 等级染色（info 灰/warn 琥珀/error 红）、`×N` 合并显示、自动滚到底 + 「暂停滚动」开关 + 「清屏」。
- **测试**：日志 reducer（append/replace/cap/合并）`devices.test.ts` 或新 `logs.test.ts` 单测。

**完成定义**：mock-device 发日志 → 桌面详情面板实时可见；打开详情手机切 1s、关闭切 8s（看 logs:wanted 流量）。

---

## 阶段2 — 批量配置下发（选中多台 → 改设置 → 手机生效） ✅ 已完成（2026-06-27）

> **UI 调整（2026-06-27，按用户反馈）**：
> - 设备详情抽屉日志面板修了「下半部空白还能滚」的幽灵滚动（LogPanel 去掉 height:100%、日志框改固定 320 高）。
> - 批量设置不再是独立导航页（删 `pages/Config.tsx` + 导航项）→ 改为**设备页勾选多台 → 「批量修改设置」按钮 → 弹窗**(`pages/BatchConfigModal.tsx`)。
> - 弹窗样式**复刻手机端设置**(`configForm.tsx`：深色卡片+TikTok 红+Section/PercentRow 滑条/StepperRow/SwitchRow/TextRow)，分页 关键词/推荐页/搜索页/个人主页/时间；**每组一个「下发这组设置」开关，只发打开的组**(沿用部分补丁通道)。
> - **下发操作日志**(`configHistory.ts`，localStorage 持久化)。
>
> **UI 二轮(2026-06-27 用户反馈)**：
> - 下发历史/进度**移出弹窗**，独立成「下发记录」导航页(`pages/History.tsx`)：上半本次进度表、下半历史表。
> - 历史每行**可展开**看「改了哪些内容」(`flattenPatch` 把 ConfigPatch 摊成 字段→值，概率显示 %、数组用 / 连接；ConfigOp 存了原始 patch)。
> - 弹窗字段**进一步对齐手机**(`configForm.tsx` 重写)：概率/数值改成手机同款 **−/+ 圆钮 + 可点输入的居中数字 + 概率下方进度条**(不再用 AntD 滑条)；时间页补「运行节奏」(搜索互动占比/点赞间隔 秒/真实发送回复)+「任务时间段」(badge+时间输入+虚线添加，`TimeWindows`)。
> - **下发后自动关闭弹窗**(进度去「下发记录」看)。
> - 历史详情改动多时一长串 → 改成**按分组折叠面板**(`groupPatch` 归到 关键词/推荐页/搜索页/个人主页/时间，AntD Collapse，组头带「N 项」计数，默认展开第一组，组内 Descriptions 双列)。比 Tab 栏更好：所有受影响组+计数一眼可见、可同时展开多组。桌面测试 34。


> 实现并测试通过：
> - @mc/shared：ConfigPatch/ModuleParamsPatch + ConfigPushMsg/ApplyMsg/ResultMsg/ProgressMsg + EVT.configPush/configApply/configResult/configProgress。
> - Hub：`domain/config-dispatcher.ts`(ConfigDispatcher：在线才下发、逐台 sent/ok/failed/offline/timeout、30s 超时用可注入定时器；8 单测) 接进 gateway(operator config:push→start、device config:result→onResult、进度广播 OPERATORS)。
> - autotk：`src/hub/configInbox.ts`(applyConfigPatch 深合并+validateParams 整体接受/拒绝；8 node:test) + protocol 加 ConfigPatch/事件 + HubClient onConfigApply/reportConfigResult + useEngine 接线(paramsRef 防闭包过期、setParams 落地、回执)。
> - 桌面：`configJobs.ts`(进度 reducer：startJob/applyProgress(终态不被迟到覆盖)/summarize/retriable；9 测) + Config 页(设备多选 + 「按开关下发」表单 + 进度表 + 重试失败项)。
> - 测试：Hub 28、桌面 28、autotk 32 全绿；desktop `npm run build` 过；**真启动冒烟过**(operator 下发→手机接受 ok / 离线 offline / 手机校验拒绝 failed 带原因)。下方为原始设计，保留备查。



**协议**
```ts
// 操作员→Hub
configPush:    "config:push"     { jobId, deviceIds: string[], patch: ConfigPatch }
// Hub→手机
configApply:   "config:apply"    { jobId, patch: ConfigPatch }
// 手机→Hub
configResult:  "config:result"   { jobId, ok: boolean, error?: string }
// Hub→操作员
configProgress:"config:progress" { jobId, deviceId, status: "sent"|"ok"|"failed"|"offline"|"timeout", error? }

ConfigPatch = 设置项子集（深合并进 AutomationParams）：
  概率类(like/save/follow/comment 比例)、调度(活跃时段/每日量)、fixedReplies、commentMatchKeywords 等。
  放 @mc/shared，autotk 与桌面共用同一类型，避免漂移。
```

**Hub**
- `domain/config-dispatcher.ts`：`ConfigDispatcher` —— 建 job、向目标在线设备 emit config:apply、登记每台状态、30s 未 ack 标 timeout、离线设备直接标 offline、收 config:result 更新并转 operator。纯类、可单测（注入"发送函数"与时钟）。
- gateway：operator 收 config:push → dispatcher.start；device 收 config:result → dispatcher.onResult。
- **测试**：dispatcher 单测（全成功/部分离线/超时/失败）+ e2e（operator push → mock-device 应用并回 ok → operator 收 progress=ok）。

**autotk（手机接收侧）**
- `src/hub/configInbox.ts`：`applyConfigPatch(current, patch)` —— 深合并 + 复用 `validateParams`（非法 patch 整体拒绝、回 error），纯函数可单测。
- HubClient：加 `onConfigApply(handler)` 订阅；`reportConfigResult(jobId, ok, error)`。
- useEngine：收 config:apply → applyConfigPatch → 持久化（AsyncStorage，沿用现有参数存储）→ 下一轮引擎读到新值 → 回 config:result。
- **测试**：configInbox 合并/校验/拒绝单测；engine.test 不回归。

**桌面**
- `pages/Config.tsx`（现为 RoadmapCard 占位）：设备多选（复用 Devices 的多选/筛选）→ 设置表单（AntD Form，分组：互动概率 / 调度 / 固定回复 / 评论匹配词）→「下发到 N 台」→ 进度表（每台 sent/ok/failed/offline/timeout，可重试失败项）。
- `hub.ts`/`hubState.tsx`：configProgress 处理 + push 动作封装。
- **测试**：进度 reducer（job 状态归并/重试）单测。

**完成定义**：桌面选中 mock-device 多台、改概率下发 → 收到 ok 进度；非法值被设备拒绝并显示 error；离线设备标 offline。

---

## 阶段3 — 文件夹工作流·基础设施（操作员放视频 → 手机收到并入库；上传 UI 留真机）

> **拆成 4 个子里程碑做**（每个测试全绿后再下一个）：
> - **3A 操作员侧文件夹核心包 ✅ 已完成（2026-06-27）**：新建独立工作区 `services/publisher`（@mc/publisher，vitest）。
>   - 纯逻辑：`dedup.ts`(文件名#大小 指纹去重)、`captions.ts`(同名txt > captions.txt映射 > 文件名；parseCaptionsFile 支持 =/:/Tab)、`scheduler.ts`(spread：把 N 条均摊到活跃时段+抖动，可注入 rng，allDay/多窗口/hmsToSec/startOfDayMs)。
>   - I/O：`scan.ts`(扫根目录→每子文件夹=设备名，只取 mp4/mov/m4v、按名排序)、`manifest.ts`(每设备 `.published.json` 读写)、`lan-server.ts`(LanFileServer：注册文件→token→局域网 HTTP 直传，含 lanAddress() 取本机 IP)。
>   - 测试 **17 全绿**（pure 11 + io 6：真文件系统 mkdtemp + 真 HTTP fetch 取字节/404）；typecheck 过。
> - **3B 发布协议 + Hub 路由/中转 ✅ 已完成（2026-06-27）**：
>   - @mc/shared：PublishSource(lan/relay)、PublishTask、PublishStatus(sent→downloading→downloaded→publishing→published/failed/offline/timeout)、isPublishTerminal + EVT.publishEnqueue/publishTask/publishResult/publishProgress。
>   - Hub `domain/publish-coordinator.ts`(PublishCoordinator：在线才下发、转发逐步状态、中间进展重置超时、长时无进展 timeout；6 单测) 接进 gateway(operator publish:enqueue→start、device publish:result→onResult、进度广播)。
>   - Hub `relay.ts`(RelayStore：内存暂存+TTL 30min+总量 512MB 淘汰最旧；handleRelay：POST /relay 存→GET /relay/:id 取) 接进 main.ts(与 socket.io 共用同一 http server)。
>   - 测试 **Hub 39 全绿**(coordinator 6 + relay 4：RelayStore 单测 + 真 HTTP POST/GET + e2e 发布流 1)；typecheck 过；**真 main.ts 冒烟过**(relay 上传下载 + 发布流 sent/downloading/published 同台服务器并存)。
> - **3C autotk 接收侧 ✅ 已完成（2026-06-27）**：
>   - `autotk/src/publish/`：`downloader.ts`(downloadToAlbum 纯逻辑，fetch/saveToAlbum 注入)、`publishQueue.ts`(PublishQueue 去重/FIFO/状态 + runPublish 状态机:下载→入相册→发布)、`album.ts`(RN saveBytesToAlbum，懒 require expo-file-system/expo-media-library)、README。
>   - autotk/src/hub/protocol.ts 加 PublishSource/PublishStatus/PublishTaskMsg/PublishResultMsg+EVT；HubClient 加 onPublishTask + reportPublishResult；TikTokUI.publishVideo? 接口 + mockUI 实现(真机坐标 TODO)；useEngine 接线(收任务→入队→串行 runPublish→回报)。
>   - 测试 **autotk 42 全绿**(新增 downloader 5 + publishQueue 5)；**跨栈真启动 e2e 过**：操作员 enqueue → 真 Hub 中转 + coordinator → **真 autotk downloader/runPublish** 从 Hub /relay 下载入相册(mock) + mock 发布 → 逐步状态 sent/downloading/downloaded/publishing/published 全回到操作员。
>   - RN 部分(album.ts 的 expo 实现 + useEngine)随 Mac 构建验；`TikTokUI.publishVideo` 真机实现(上传坐标)留机型适配阶段。
> - **3D 桌面发布页 + Electron 接线 ✅ 已完成（2026-06-27）**：
>   - `@mc/publisher`：`plan.ts`(planDevice 纯函数：去重→文案→排程) + `agent.ts`(PublishAgent：refresh 出各设备待发计划 / prepareSource lan|relay / markPublished 落清单)。**改成可被 require 的 CJS 包**(去 type:module，加 tsconfig.build → dist + package main)。
>   - 渲染层：`publish-ipc.ts`(window.publisher 契约 + getPublisherApi) + `publishState.ts`(发布进度 reducer，6 测) + hubState 接 publish:progress/enqueuePublish + `pages/Publish.tsx`(根目录选择/扫描、传输方式 lan/relay、各设备待发已发表、单条/全部发布、进度表、发布成功自动 markPublished+刷新；非 Electron 环境降级提示)。
>   - Electron：`preload.cjs`(contextBridge 暴露 publisher) + `main.cjs`(PublishAgent + LanFileServer + ipcMain 四个 handler + 选目录 dialog)。**⚠ 跑 Electron 前需 `npm run build -w @mc/publisher`**(main.cjs require dist)。
>   - 测试 **publisher 22(+plan/agent 5，含真 LAN 直链下载) + 桌面 40(+publishState 6) 全绿**；`node -e require('@mc/publisher')` 验 CJS 可加载；**全链路真启动 e2e 过**：agent 扫文件夹(promo.mp4+captions.txt文案)→prepareSource lan→Hub→**真 autotk 下载 21 字节入相册(mock)+发布**→sent..published→markPublished→刷新待发 0/已发 1。
>   - 仅 Electron GUI 外壳 + RN 真机 TikTok 上传坐标 需各自运行时验（无显示/无真机）。**阶段3（文件夹工作流）至此功能完整。**


> 真机边界：**做到「视频到达手机相册 + 发布任务入队」为止**。真正在 TikTok 里点上传/填文案/发布的 UI 自动化，
> 走 `TikTokUI.publishVideo?()` 接口 + mockUI 实现验证逻辑，真机阶段再标定坐标实现。

**桌面（本地，Node 侧）**
- `services/folder/`（桌面内置本地后端，或 Electron 主进程模块）：
  - `watcher.ts`：监视根目录下「以设备名命名的子文件夹」，发现新视频入队（chokidar 或 fs.watch + 轮询兜底）。
  - `dedup.ts`：每设备 `.published.json` 清单（按文件 hash/名+大小）去重，纯函数可单测。
  - `scheduler.ts`：把当天待发均摊到「活跃时段」+ 随机抖动（复用 autotk 的 jitter 思路），纯函数可单测。
  - `captions.ts`：文案解析——同名 `<video>.txt` > 文件夹 `captions.txt`(按行/按名) > 文件名；支持占位符。纯函数可单测。
  - `lan-server.ts`：起一个本地 http 把视频字节按 token 提供给手机（同局域网直传）。
- **测试**：dedup/scheduler/captions 纯函数单测（node:test）。

**Hub（跨网中转降级）**
```ts
publishTask:   "publish:task"    Hub→手机 { taskId, deviceId, caption, source: {kind:"lan", url} | {kind:"relay", url} }
publishResult: "publish:result"  手机→Hub { taskId, status:"downloaded"|"published"|"failed", error? }
publishEnqueue:"publish:enqueue" 操作员→Hub { deviceId, taskId, caption, lanUrl?, relay? }
```
- `domain/publish-relay.ts`：同网给 lan url；跨网时桌面把视频 PUT 到 Hub、Hub 暂存并给 relay url（中转）。纯路由逻辑可单测（注入存储）。
- gateway 接 enqueue/result 转发。

**autotk（手机接收侧）**
- `src/publish/`：
  - `downloader.ts`：按 source 拉视频（lan 直连，失败/跨网走 relay），写入相册（expo-media-library），纯逻辑+注入 fetch 可单测。
  - `publishQueue.ts`：任务队列/去重/状态机（downloaded→published），可单测。
  - `TikTokUI.publishVideo?(asset, caption)`：**接口新增**；mockUI 给出可测实现；真机实现（onDeviceUI/calibratedUI）留 TODO（标定上传入口坐标）。
- HubClient 接 publish:task；useEngine 把发布任务排进调度（与养号互斥/错峰）。
- **测试**：downloader/publishQueue 单测；engine 用 mockUI 跑「收到任务→入库→（mock）发布→回 published」。

**桌面**
- `pages/Publish.tsx`（现占位）：根目录设置、各设备子文件夹/待发/已发列表、调度预览（今天几点发哪条）、失败重试、手动「立即发」。

**完成定义**：在桌面根目录某设备子文件夹放一个视频 → mock-device 收到 publish:task → 走 downloader（mock 写入）→ publishQueue 经 mock 发布 → 桌面看到 published。真机阶段只需补 `publishVideo` 的真实坐标实现。

---

## 测试纪律
- Hub：node:test（域类单测）+ e2e（起 Hub + mock-device + operator 探针）。
- 桌面：reducer/纯函数 vitest/node:test + `vite build` 类型检查（本机无显示，GUI 用户机器跑）。
- autotk：node:test 子集（configInbox/downloader/publishQueue/config/engine 不回归）；RN 接线随 Mac 构建验。
- 每个里程碑结束跑各项目 `npm test` 全绿后才进下一个。

## 不在本方案内（依赖真机）
- #3 评论坐标/阈值现场调；#4 真机验 `/alert`；阶段3 的 TikTok 上传 UI 真实坐标标定；autotk 全部 RN 接线的设备级验证。
