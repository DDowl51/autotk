# 管理中心 改进开发文档（R1）

对应 `req-improvements.md`。三端：`apps/desktop`（Electron）、`services/hub`、`autotk`（手机端，独立仓库）。
原则不变：业务逻辑端口-适配器化、纯函数单测 + socket.io e2e；手机端纯逻辑单测 + 构建验证。

---

## 开放问题决议（已定）

- **日志保留**：仅**内存**环形缓冲，每台 **500 条**（不落库）。
- **疑似卡住阈值**：默认 **5 分钟**、**可配置**，放**设置页**（桌面端 `AppSettings.stalledMinutes`，存 localStorage）。
- **日志限流（手机端，几百台不压垮 Hub/带宽）**：
  - 日志进本地小缓冲，**按批 flush**：被操作员查看时每 **1s**，未被查看时每 **8s**（Hub 在该设备有/无观察者时下发 `logs:wanted {on}` 切换）。
  - flush 时**合并相邻重复**（"×N"）、**单批上限 ~80 条**（超出丢最旧 + 标记"…省略 N 条"）、默认只发 **info 及以上**。
  - `device:log` 用**批量** `{ lines: DeviceLogMsg[] }`，省 socket 开销。
- **设备名（可读 + 唯一）**：
  - `deviceId` = identifierForVendor（复用 license，唯一稳定）= 系统主键。
  - `deviceName` = 可读：autotk「设备别名」设置；未设则取 iOS 设备名（`expo-device` `Device.deviceName`），再不行用型号。
  - 唯一性：展示时同名设备追加 `· <deviceId 末4位>`；阶段 3 文件夹名 `<deviceName>-<deviceId 末6位>`。
  - autotk 设置加「设备别名」字段。

---

## 0. 协议扩展（`packages/shared`）

`protocol.ts` 增补（手机/Hub/桌面共用）：

```ts
// 状态已有 page? + lastProgressAt?(stalled 判定)；新增日志消息 + 标签映射
export interface DeviceLogMsg { level: "info" | "warn" | "error"; msg: string; ts: number; }

export const EVT = {
  ...,
  deviceLog: "device:log",            // 手机 → Hub（批量 { lines: DeviceLogMsg[] }）
  operatorWatchLogs: "operator:watch-logs",   // 操作员 → Hub { deviceId }
  operatorUnwatchLogs: "operator:unwatch-logs",
  logsWanted: "logs:wanted",          // Hub → 手机 { on } 该设备有/无观察者，切换上报频率
  logsSnapshot: "logs:snapshot",      // Hub → 操作员 { deviceId, lines: DeviceLogMsg[] }
  logsBatch: "logs:batch",            // Hub → 操作员 { deviceId, lines: DeviceLogMsg[] }
} as const;

// 代码名 → 中文（两端一致，避免各写各的）
export const MODULE_LABELS: Record<string, string> = {
  forYou: "推荐页", kwSearch: "关键词搜索", persHome: "个人主页",
};
export const PAGE_LABELS: Record<string, string> = {
  feed: "推荐流", comments: "评论区", search: "搜索结果", profile: "个人主页",
};
export const moduleLabel = (m?: string) => (m ? MODULE_LABELS[m] ?? m : "—");
export const pageLabel = (p?: string) => (p ? PAGE_LABELS[p] ?? p : "—");
```

---

## 改进 3：模块/页面中文映射（桌面端，最快，无依赖）

- 桌面 `Devices.tsx` 模块列、详情「当前模块」用 `moduleLabel()`；「当前页面」用 `pageLabel()`。
- **测试**：`moduleLabel/pageLabel` 纯函数单测（已知→中文、未知→原样、空→—）。放 `packages/shared` 或桌面 `labels.test.ts`。
- 工作量：~0.5h。可立即做。

---

## 改进 1：界面专业化（桌面端为主）

拆成可独立交付的子项（每项小、各带验证）：

1. **搜索/筛选/排序**（纯桌面）
   - `Devices.tsx`：顶部加 搜索框（按 deviceName）+ 状态筛选（statusKind）+ 列排序。
   - 纯函数 `filterDevices(list, {q, status})` + `sortDevices` → `devices.ts`，**单测**。
2. **告警中心**（桌面）
   - 新页「告警」或总览内强化：列出 `status.alert` 的设备，带时间、设备、级别；本地「已读」集合（localStorage）。
   - 纯函数 `collectAlerts(map)` → 单测。
3. **数据可视化**（桌面，加 `recharts`）
   - 总览加：机群在线趋势（需要时间序列——见下「采样」）、互动量趋势。
   - **采样**：桌面端按固定间隔对 `summary` 取样存内存（如每 30s 一点，留最近 60 点），画折线。纯函数 `pushSample(series, point, cap)` → 单测。
4. **状态语义：疑似卡住 stalled**（桌面 + 轻量手机配合）
   - 定义：在线 + running + 距上次"进展"超过阈值（**默认 5 分钟，设置页可配** `stalledMinutes`）。
   - "进展"= stats（尤其 videos）发生变化的时间。Hub 在 `updateStatus` 时对比上次 stats，记录 `lastProgressAt`；放进 `DeviceInfo`（协议加可选字段 `lastProgressAt?`）。
   - 桌面 `statusKind` 增加 `stalled`（介于 running 与 alert 之间，黄色）。纯函数判定 → 单测。
5. **细节打磨**：陈旧标记（lastSeen 过久变灰）、批量多选（rowSelection，为阶段 2 铺路）、骨架/空/错误态、列配置（可选）。

> 设计仍走 frontend-design 的「控制室」基调；图表配色用 teal/amber/red 信号色，保持一致。

**测试**：以上纯函数（filter/sort/collectAlerts/pushSample/stalled 判定）全单测；UI 走 vite build 验证。

---

## 前置：autotk ↔ Hub 接入（手机端，#2/#4 的基础）

手机端目前没连 Hub。要做日志/页面上报，先让 autotk 作为 device 连上 Hub。

**autotk 侧（`autotk/src/hub/`）**
- 加依赖 `socket.io-client`（RN 可用）。
- **vendor 协议**：把 `@mc/shared` 的事件名 + 类型 + 标签映射拷到 `autotk/src/hub/protocol.ts`（同 license SDK 的 vendoring 套路，附"保持同步"注释）。
- `HubClient`：以 `auth:{ role:"device", deviceId, deviceName, version }` 连 Hub。
  - `deviceId`：复用 license 的 `resolveDeviceId()`（identifierForVendor）。
  - `deviceName`：autotk 设置里的别名，缺省用 iOS 设备名/型号。
  - `reportStatus(s)`：发 `device:status`；`log(line)`：发 `device:log`。
  - 健壮性：socket.io 自动重连；离线时本地丢弃或小缓冲（避免堆积）。
- **配置**：Hub URL 放 autotk 设置/`config`（可 EXPO_PUBLIC_ 覆盖），可与 license baseUrl 同源不同端口。
- **接线 useEngine**：
  - 周期（如每 5s）从引擎读 `{ running, module, page, stats }` → `reportStatus`。
  - 引擎 `module`：在主循环分发模块时记录"当前模块"（加 `ctx.setModule?(name)` 或引擎内状态 + getter）。
  - 引擎 `page`：`TikTokUI` 加可选 `getPage?(): string`；`onDeviceUI` 返回其内部 `page`（feed/comments/...）。`calibratedUI` 同样可选实现。
  - 日志：`ctx.logger.log` 现有；包一层同时 `hub.log({level,msg,ts})`（useEngine 的 pushLog 旁路一份给 HubClient）。
- **纯逻辑单测**（autotk node:test）：状态采集映射（引擎态→DeviceStatus）、日志节流/格式化等抽纯函数测；socket.io/RN 部分随 Mac 构建验。

**协议/类型**：autotk vendor 的 protocol 与 `@mc/shared` 对齐（事件名、字段）。

---

## 改进 4：当前页面（手机上报 + 桌面显示）

- 手机：`HubClient.reportStatus` 带 `page`（来自 `ui.getPage?.()`）。
- 桌面：详情「当前页面」用 `pageLabel(status.page)`（改进 0/3 已有映射）。
- **测试**：pageLabel 单测（已含）；手机 getPage 取值随构建验。
- 依赖：autotk↔Hub 接入。工作量小（接入做完后顺带）。

---

## 改进 2：手机日志（三端，最重）

**Hub（`services/hub`）**
- `domain/logbuffer.ts`：每设备环形缓冲（默认 500 条），纯类 `LogBuffer`（append/recent），**单测**。
- registry 或新 `LogHub`：`appendLog(deviceId, line)` → 存缓冲 + 向房间 `logs:<deviceId>` emit `logs:line`。
- gateway：
  - device `device:log` → `appendLog`。
  - operator `operator:watch-logs {deviceId}` → join `logs:<deviceId>` + 回 `logs:snapshot`（recent）；`operator:unwatch-logs` → leave。
- **e2e**：mock 设备发日志 → 操作员 watch → 收 snapshot + 后续 line；unwatch 后不再收。

**桌面（`apps/desktop`）**
- 设备详情加「日志」Tab/面板：打开时 `watch-logs`，收 snapshot 渲染 + `logs:line` 追加；关闭/切换设备时 `unwatch`。
- 交互：自动滚动（可暂停）、按级别过滤、搜索、清屏。日志多时**截断/虚拟滚动**防卡。
- 纯函数：日志过滤（level + 关键词）→ 单测。

**手机（autotk）**
- HubClient 已能 `log()`；把 useEngine 的日志旁路一份上报（限流：合并高频、丢 debug 级）。

---

## 测试矩阵

| 模块 | 单测 | e2e / 集成 | 构建 |
|---|---|---|---|
| shared 标签映射 | moduleLabel/pageLabel | — | tsc |
| 桌面 #1 纯函数 | filter/sort/collectAlerts/pushSample/stalled | — | vite build |
| 桌面 #2 日志过滤 | 纯函数 | — | vite build |
| hub 日志 | LogBuffer | socket.io: 发日志→watch 收 snapshot+line | tsc |
| autotk 接入 | 状态采集/日志节流纯函数(node:test) | — | Mac 构建 |

---

## 里程碑顺序

1. **M1（桌面独立，先做）**：协议加标签映射 → 改进 3（中文） + 改进 1 子项（搜索/筛选/排序、告警中心、图表）。纯桌面，立即见效。
2. **M2（接入前置）**：autotk ↔ Hub 接入（HubClient + 状态上报 + 引擎接线）。手机首次上看板。
3. **M3**：改进 4（当前页面）—— 接入后顺带。
4. **M4（最重）**：改进 2（日志三端）。
5. （stalled「疑似卡住」需 M2 的进展时间戳，归到 M3 一并做。）

> M1 不依赖手机端，可马上开工；M2 起进入"嵌入手机 app"阶段。
