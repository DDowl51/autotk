# 方案：应用内浮层检测与自动脱困（detectPopup）

> **状态(2026-06-28)：1~4 已实现 + 单测过(autotk 53 测)；第 5 步真机精调待真机阶段。**
> 落地：`src/engine/popupDetect.ts`(detectAppPopup+签名表+区域/结构判定) + `popupDismiss.ts`(planDismiss)
> + onDeviceUI(escapeAppPopup / detectPopup 真检测 / recoverIfLost 内先脱困 / onEvent 埋点)
> + 模块改"自动关、关不掉才结束本轮" + realUI 注入 onEvent:track + 埋点 popup_detected/popup_escaped。

---


> 目标：让引擎能识别 TikTok **应用内**的干扰浮层/弹窗，自动关掉继续养号；关不掉的才告警。
> 边界：**框架 + 起步规则现在写、可单测**；标记词表/区域阈值/手势坐标的**精调放真机阶段**。
> 与现有的区分：**系统弹窗**（权限/登录 passkey 等）已由 WDA `/alert`(#4) 处理；**误入未知页面**由 `recoverIfLost` 处理。本方案补的是**盖在信息流上、`/alert` 看不到的 TikTok 自有浮层**。

---

## 1. 要应对的浮层（分类）
| 类型 | 例子文案 | 关闭方式 |
|---|---|---|
| 登录/注册引导 | Log in to TikTok / Sign up / 登录 / 注册 | ✕ 或 "Not now" |
| 通知/功能引导 | Turn on notifications / Add Yours / 开启通知 | ✕ / "Not now" / 返回 |
| 关注/订阅引导 | Log in to follow / Follow back | ✕ / 点外部 |
| 底部操作单残留 | 分享单、评论区没关干净 | 下滑关闭 / 点外部 |
| 长按菜单/"不感兴趣" | Not interested / Report | 点外部 / 返回 |
| 直播/购物推广浮层 | LIVE / Shop now 浮层 | ✕ / 返回 |

不处理：正常信息流、搜索框、顶部 For You/Following 标签（白名单，永不判为浮层）。

---

## 2. 检测策略（OCR + 区域 + 结构信号，抗误判）
纯逻辑 `detectAppPopup(boxes, size) → PopupHit | null`：

1. **签名表**（可配）：每个浮层 = `{ id, markers: string[], dismiss }`。命中 markers 里的词即疑似。
2. **区域过滤**（关键防误判）：
   - 忽略右侧动作栏（x > 0.85）和左下文案带（视频文案常出现在此）里的文字——这些是正常内容，不算浮层。
   - markers 必须落在**中央卡片区**（约 y 0.25~0.75、x 居中）或**底部单区**（y > 0.75 且横跨）。
3. **结构信号**：要么命中**强标题词**（如 "Log in to TikTok"），要么同时存在**可关闭控件**（✕ / Not now / Cancel / 取消 / 暂不 / 以后）。只命中单个普通词不算，降低误判。
4. 返回 `PopupHit { id, dismiss, matched }`，附调试信息（命中了什么、在哪），方便真机调词表。

> 复用：关闭控件的词表直接用 `alertIntent.ts` 里"否定按钮"那套（Not Now/Don't Allow/取消…），保持一致。

---

## 3. 脱困策略（执行 dismiss 计划）
`PopupHit.dismiss` 是有序的尝试计划，逐个试到浮层消失：
1. **点文字按钮**：OCR 里找到 ✕ / Not now / Cancel / 取消 等的框 → 点它的中心。
2. **点 ✕ 角标**：用 `detect`/`railDetect` 找右上角 ✕（红/灰图标）→ 点。
3. **手势兜底**：底部单 → 下滑关闭；居中卡 → 点卡片外部暗区（屏幕顶部安全点）；都不行 → iOS 左缘右滑返回。
4. 每步后**重新检测**，最多 N 次（如 3）；仍在 → 放弃，交给告警。

---

## 4. 架构与文件
- `src/engine/popupDetect.ts`（**纯**）：签名表 + `detectAppPopup(boxes, size)` + 区域/结构判定。**重点单测**。
- `src/engine/popupDismiss.ts`（**纯**）：`planDismiss(hit) → DismissStep[]`（把 hit 转成"点哪个词框/点✕/下滑/返回"的有序步骤，坐标用归一化 + size 算）。可单测。
- `onDeviceUI.ts`（真机）：
  - `detectPopup()`：截图 → OCR → `detectAppPopup` → 存 hit、返回 bool。
  - 在 `recoverIfLost()`（每条视频前已调用）里：**先**试 `detectAppPopup` + 执行 dismiss 步骤，**再**走原来的"未知页面左滑返回"。这样浮层每轮自动清。
- `mockUI.ts`：detectPopup 仍返回 false（演示无浮层）。

## 5. 引擎接入（改"等人工"为"先自动关"）
`modules/forYou.ts` / `kwSearch.ts` 现在：`detectPopup() → "检测到弹窗，等待人工干预"`。
改为：检测到 → 调脱困（recoverIfLost 已含）→ 再 detect；**仍在才**记 warn + 上报告警（status.alert）。即：能自动关的不打扰，关不掉的才告警到管理中心。

---

## 6. 起步签名表（真机再调）
内置常见英文 + 中文标记（示例，真机按实际界面增删）：
- `login`: markers ["Log in to TikTok","Sign up for TikTok","登录后","注册"]，dismiss=[text:Not now/✕]
- `notif`: ["Turn on notifications","开启推送","Don't miss out"]，dismiss=[text:Not now/暂不]
- `addyours`: ["Add Yours"]，dismiss=[✕/back]
- `sheet`: 底部单标志（如 "Send to"/"分享到"）→ dismiss=[swipeDown/tapOutside]
- `generic-x`: 中央区存在 ✕ 且有暗化背景 → dismiss=[tap ✕]

---

## 7. 埋点（接入已有 telemetry）
- `popup_detected` { id }
- `popup_escaped` { id, ok }（ok=是否成功关掉）
便于上线后看哪些浮层最常出现、自动脱困成功率，回头精调词表。

---

## 8. 测试
- `popupDetect.test`（node:test）：每种签名的**正例**（构造 OCR 框 → 命中 + dismiss 正确）、**负例**（正常文案含 "login" 但在文案带/右栏 → 不命中）、区域过滤、强标题 vs 仅单词。
- `popupDismiss.test`：hit → DismissStep 坐标/顺序正确。
- 真机部分（实际点掉、词表/坐标精调）随真机阶段。

## 9. 风险与诚实边界
- OCR 启发式**必然需要真机调词表/区域**来平衡"漏检 vs 误判"；起步表只是脚手架。
- 纯手势关闭的浮层（无文字）靠下滑/返回兜底，不保证 100%。
- 没有 OCR 原生模块时（VisionOcr 未接）detectPopup 退化为不可用（无文字可读）→ 退回原 recoverIfLost 行为。
- 不真机无法验证"点掉"，本期交付=可单测的检测+脱困**决策**逻辑 + 接线，落地效果待真机。

## 10. 交付顺序
1. `popupDetect.ts` + `popupDismiss.ts`（纯逻辑）+ 单测 ← 现在
2. onDeviceUI 接 detectPopup + recoverIfLost 内脱困 ← 现在（真机验）
3. 引擎模块改"先自动关再告警" ← 现在
4. 埋点两事件 ← 现在
5. 真机调签名表/区域/坐标 ← 真机阶段（清单里）
