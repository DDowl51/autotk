# L0 原子操作层 — WDA 规格书(G0)

autotk 2.0 最底层。**手机与主控之间的全部协议面**——上层永不直接拼 WDA URL。总纲见 `../autotk-2.0-架构设计总纲.md` §4。

> 目标:让 G1 能照此从零实现多实例 `WdaClient`,不看旧代码。所有约束来自旧 autotk 反复试错(`apps/mobile/CLAUDE.md`),违反即卡死/超时。

## 0. 定位

- **WDA(WebDriverAgent)** 在每台被控 iPhone 上监听 `:8100`,REST/JSON。主控经 LAN 直连(`http://<手机IP>:8100`)。
- **每台手机 = 一个 `WdaClient` 实例**(自带 `baseUrl` + `sessionId`)。这是构造性事实,不是「改造」——一进程管 N 台的前提。
- L0 **无语义、无失败判断**:动作是盲的(A2),成功与否由上层截图验证。L0 只负责「把请求正确发出去、把响应正确读回来、超时不卡死」。

## 1. 硬约束(务必遵守,来自真机踩坑)

1. **`snapshotMaxDepth:1` 性命攸关**。TikTok 视图树极大,深快照触发 `kAXErrorIPCTimeout`(>20s)。建会话后**必须** `applyFastSettings`。
2. **不能靠元素树定位 TikTok 按钮**(深度 1 读不到树)→ 全走**截图 + 视觉/VLM 定位坐标 + 坐标点击**。故 L0 **不提供** findElements/element* 语义能力给业务(barrel 里可留但业务层禁用)。
3. **点击/滑动只能用 W3C `/actions` 端点**。此 WDA(14.x)已移除旧 `/wda/tap/0`、`/wda/touch/perform`(Unhandled,勿用)。
4. **打字用 `/wda/keys`**。
5. **建空会话**:`POST /session` 不传 bundleId(不等 App 启动,快),再 `activateApp` 切前台。
6. **每次请求 20s 超时**(AbortController),避免卡到 fetch 默认 5 分钟。
7. **任何动作前必须 `activateApp(TIKTOK)`**——WDA 操作只作用于前台 App,否则会点到桌面/别的 App。(L2 动作层负责在动作开头调;L0 提供该原子。)

## 2. WdaClient 接口(TS 规格)

```ts
const TIKTOK_BUNDLE_ID = "com.zhiliaoapp.musically";
interface Point { x: number; y: number; }   // 像素坐标(非归一化)

class WdaClient {
  constructor(baseUrl: string, opts?: { timeoutMs?: number /* 默认 20000 */ });

  // —— 会话 ——
  createSession(): Promise<void>;   // POST /session 空会话 → 存 sessionId → 立即 applyFastSettings()
  resetSession(): void;             // 仅清本地 sessionId(不发网络),WDA 重启自愈用
  deleteSession(): Promise<void>;
  getSessionId(): string | null;
  windowSize(): Promise<{ width: number; height: number }>;  // 逻辑分辨率(iPhone8 = 375×667)

  // —— 前台 ——
  activateApp(bundleId?: string): Promise<void>;  // 默认 TIKTOK;动作前必调

  // —— 观测 ——
  screenshot(): Promise<Buffer>;    // GET .../screenshot → base64 解码为 PNG Buffer

  // —— 触控(W3C /actions) ——
  tap(p: Point): Promise<void>;
  swipe(from: Point, to: Point, durationMs: number): Promise<void>;

  // —— 输入 ——
  typeText(s: string): Promise<void>;   // POST /wda/keys
  pressHome(): Promise<void>;
}
```

> **系统弹窗不走 /alert 通道(2026-07-10 定)**:iOS 系统弹窗(权限窗等)统一按普通危险目标处理——
> 截图里拍得到(springboard 层在 WDA 截图内,IMG_0008 实证)、普通 `tap` 点得到(本会话 OCR 兜底点
> 「Don't Allow」实证)。`/alert/*` 端点对带地图的定位窗**本来就读不到**,留着是不可靠的第二通道,
> 违背「屏幕即真相 + 单一路径」,故 L0 不提供。

## 3. 端点映射

| 方法 | HTTP | 备注 |
|---|---|---|
| createSession | `POST /session` body `{capabilities:{alwaysMatch:{"appium:shouldWaitForQuiescence":false}}}` | 不传 bundleId |
| applyFastSettings | `POST /session/{sid}/appium/settings` | 见 §4 |
| windowSize | `GET /session/{sid}/window/size` | |
| activateApp | `POST /session/{sid}/wda/apps/activate` body `{bundleId}` | |
| screenshot | `GET /session/{sid}/screenshot` | value=base64 PNG |
| tap | `POST /session/{sid}/actions` | W3C pointer,见 §5 |
| swipe | `POST /session/{sid}/actions` | W3C pointer + move duration |
| typeText | `POST /session/{sid}/wda/keys` body `{value:[...chars]}` | |
| pressHome | `POST /session/{sid}/wda/homescreen` | |

统一响应信封 `{ value, sessionId }`;非 2xx 或 value 含错误 → 抛 `WdaError(message,status,path)`。

## 4. applyFastSettings 内容(建会话后立即)

```json
{ "settings": {
  "waitForIdleTimeout": 0,
  "animationCoolOffTimeout": 0,
  "shouldWaitForQuiescence": false,
  "shouldUseCompactResponses": true,
  "snapshotMaxDepth": 1
} }
```
理由:TikTok 视频永不静止,`waitForIdle*=0` 否则每次操作等到默认 60s;`snapshotMaxDepth:1` 治深快照超时(实测点击约 0.5s)。

## 5. W3C /actions 触控体(必须,不用旧端点)

**tap**(点 (x,y)):
```json
{ "actions": [{ "type":"pointer","id":"finger1","parameters":{"pointerType":"touch"},
  "actions":[
    {"type":"pointerMove","duration":0,"x":X,"y":Y},
    {"type":"pointerDown","button":0},
    {"type":"pause","duration":60},
    {"type":"pointerUp","button":0}
  ]}]}
```
**swipe**(从 (x1,y1) 到 (x2,y2),时长 D ms):同结构,`pointerDown` 后 `pointerMove duration:D x:x2 y:y2` 再 `pointerUp`。

## 6. 错误处理与自愈规格

- **20s 超时**:每请求 AbortController;超时抛 `WdaError(status=0)`。
- **会话失效自愈**:WDA 进程重启后旧 sessionId 在设备侧失效、后续请求 404。上层探测到连续失败 → 调 `resetSession()` 强制下次 `createSession()` 重建。**这是无人值守整夜跑的自愈开关。**
- **L0 不重试、不判成败**:重试/升级是上层(Step `onFail`)的事。L0 只如实抛错。

## 7. 明确不做(相较旧 barrel)

- 不给业务层用 `findElements/element*/source`(深度 1 无意义,诱导错误定位)。
- 不用 `touchPerform`(此设备 Unhandled)。
- 不做固定 sleep(上层用 `await(target)`)。
- **不提供 `/alert/*` 系列**(alertText/alertButtons/alertClick/alertDismiss):系统弹窗统一走
  截图 → VLM 定位(`sys.*` Target 的 phrase)→ `tap`。理由见 §2 注;带地图的定位权限窗 /alert 读不到,
  tap 路径已真机实证。

## 8. G1 验收标准

- 两个 `WdaClient` 实例(两台手机)并发跑截图/点击/滑动,**互不串话**(证明无全局单例残留)。
- 拔掉一台 WDA 再起,上层触发 `resetSession()` 后能自动重建会话继续。
- 单请求 20s 超时生效(断网测)。
- 全程只用 `/actions` + `/wda/keys`,无旧端点。
