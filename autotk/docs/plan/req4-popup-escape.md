# 需求 4：脱困加强 —— 系统权限弹窗的识别与逃离

> **状态：核心已完成（2026-06-24），待真机验证 WDA alert 接口。**
> 已做：`src/wda/operations/alert.ts`（alertText/Buttons/ClickButton/Dismiss）；`src/engine/alertIntent.ts`（按钮意图表 chooseAlertButton，除相册外一律拒绝，含中英；已单测）；`handleSystemAlert` 接进 onDeviceUI 的 recoverIfLost+recoverToFeed、calibratedUI 的 recoverIfLost；REPL `alert` 命令测。`npm test` 全绿。
> **待真机验**：WDA 14.x 上 `/alert/text`、`/wda/alert/buttons`、`/alert/accept{name}` 是否好使（REPL `alert` 验）。不行就退回 OCR。
> **未做（后置）**：完整的"每动作声明预期页+afterAction 校验"框架（当前用 recoverIfLost 的页面判定 + 每视频/批次的 alert 检查覆盖主要场景）；应用内浮层按钮的 OCR 点按扩充；卡死告警管理中心（依赖 #1）。

## 目标

概率性出现的弹窗（尤其新注册账号高发：系统权限弹窗、TikTok 内引导弹窗）经常把自动化困住。要做到**每步操作后校验是否到了预期页面，没到就识别并逃离弹窗**。

## 现状（已做的脱困）

- `recoverToFeed`（每批次开头）：关评论、关 passkey 弹窗（OCR 命中关键词→点✕）。
- `recoverIfLost`（每条视频前）：判断是否在"已知页面"（视频流/评论区），连续≥2 次不在 → 左滑返回。
- `dismissPopup`：OCR 命中 `Sign In/passkey/...` → 点✕/下滑。

这些是"事后兜底"。需求 4 要把它升级成**你提的"每步操作后校验预期页面"** 的更主动框架。

## 关键洞察：两类弹窗，两种处理

1. **iOS 系统弹窗**（权限：通知/相册/跟踪/定位…，按钮 Allow/Don't Allow/OK/Cancel/Not Now）
   → **WDA 有原生 alert 接口**（`/alert/text`、`/alert/buttons`、`/alert/accept`、`/alert/dismiss`、按文字点按钮）。
   **比 OCR 可靠得多**，应优先用它检测+处理系统弹窗。（待真机验证：snapshotMaxDepth=1 下 alert 接口是否可用——大概率可用，因系统 alert 走 springboard，不依赖 app 深快照。）
2. **TikTok 应用内浮层/引导弹窗**（非系统 alert，如登录引导、活动弹窗、passkey sheet）
   → 走**截图 + OCR**：命中已知"关闭/取消"类文案 → 点对应按钮/✕/下滑。

## 设计：操作 → 预期页面校验 → 分级脱困

### A. 给每个高层动作声明"预期结果页面"

扩展页面模型（当前 `Page = feed | comments`，扩成枚举：`feed | comments | searchInput | searchResults | profileGrid | ownVideo | unknown`）。每个 UI 动作执行后，应处于某个预期页面。

### B. 每步操作后校验（核心）

封装一个 `afterAction(expected: Page)`：

1. 截图 → `classifyPage()`（综合：WDA alert 检测 + 图像检测动作栏/评论✕ + OCR 文字签名）。
2. 若 == expected → OK。
3. 若检测到**系统 alert** → 用 WDA alert 接口按策略处理（见 C）→ 重新校验。
4. 若检测到**应用内弹窗**（OCR 命中"取消/关闭/以后再说/Not Now/Cancel/Skip/Don't Allow"等）→ 点对应按钮 → 重新校验。
5. 若是别的未知页面 → 左滑返回（已有 `swipeBack`）→ 重新校验。
6. 多次仍不对 → 升级：`activateApp(TikTok)` → 重启 TikTok → 长冷却报警。

> 你提的"识别页面有没有 Cancel 之类字样 → 判定被弹窗困住" 正是第 4 步。我建议**再加一层**：优先用 WDA alert 接口判系统弹窗（更准），OCR 文案作为应用内弹窗的兜底。

### C. 系统弹窗的处理策略（按钮文字 → 动作）

维护一张"按钮意图表"（多语言）：

- 拒绝类（点它）：`Don't Allow / 不允许 / Ask App Not to Track / 以后再说 / Not Now / 暂不 / Cancel / 取消 / Skip / 关闭`
- 允许类（**仅特定权限点它**）：相册/照片权限——发视频(#1)需要 → `Allow / 允许 / OK`；其余权限默认拒绝。
- 用 WDA `/alert/buttons` 拿按钮列表，匹配意图表，点最合适的那个。

## 执行步骤

1. **WDA alert 操作**：`src/wda/operations/alert.ts`：`alertText()`、`alertButtons()`、`alertAccept()`、`alertDismiss()`、`alertClickButton(label)`（W3C `/alert/...`）。
2. **页面分类器** `classifyPage()`：在 onDeviceUI 内，综合 alert + 图像(动作栏/评论✕) + OCR 文字签名（各页面的特征词）。先列出各已知页面的判据（结合历史截图）。
3. **按钮意图表**：常见系统/应用弹窗的"关闭/拒绝/允许"文案表（中英）。
4. **afterAction(expected)** 封装 + 在关键动作后调用（先在最易出弹窗的：打开评论、进主页、搜索、发视频）。
5. **REPL 工具**：`alert`（打印当前 alert 文字+按钮）、`classify`（打印页面判定）便于真机调。
6. 真机边测边调：故意触发权限弹窗，验证 alert 接口能读到、能按策略点掉。

## 依赖 / 顺序

- 独立。**建议早做**（#1 发视频、#3 评论、养号都受益）。可在 #2 之后。

## 风险 / 注意

- WDA alert 接口在本机 WDA 14.x + snapshotMaxDepth=1 下是否好使，**需真机先验**（写个 REPL `alert` 命令测）。不行就退回纯 OCR。
- 系统弹窗按钮文字随系统语言变 → 意图表要含中英（手机系统语言？需确认）。
- "每步都截图校验"会增加耗时/截图量 → 只在**易出弹窗的关键步骤**后校验，不是每个原子 tap 都校验。

## 开放问题

- 手机系统语言是中文还是英文？（决定意图表优先语言。）
  A： 英文
- 权限弹窗的统一策略：除"相册（发视频要用）"允许外，其余一律拒绝/Not Now，对吗？
  A :完全正确
- 是否需要"卡死时给管理中心(#1)报警"？（依赖 #1 的连线能力。）
  A： 要告警管理中心
