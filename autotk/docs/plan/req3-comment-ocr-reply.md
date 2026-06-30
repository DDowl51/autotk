# 需求 3：评论区 OCR + 对匹配评论的用户回复

> **状态：逻辑层已完成+测试通过（2026-06-24），坐标/阈值待真机调。**
> 已做：参数 `commentMatchKeywords`（schema+UI+parse）；`src/engine/commentParse.ts`（parseComments 聚类 + matchComment，已单测）；common.ts 接入（命中匹配词才回复该作者，传 author/keyword 给生成器，{user}→@作者，{kw}→命中词）；onDeviceUI 的 listComments 改为 OCR 解析评论文字/作者并缓存、replyComment 改为针对该条评论（best-guess 坐标）；UI 加"评论匹配词"。`npm test` 17 全绿（含 #3 集成测试：只回复命中作者 + {user} 展开）。
> **待真机调**：parseComments 的区域/行间距阈值、爱心↔评论对齐、replyComment 的"Reply"入口坐标。可重建 App 看"评论解析：N 条"日志调，或后续给 REPL 加整屏 OCR 做现场调。

## 目标

对**命中正向关键词的视频**，进评论区后 **OCR 识别每条评论文字**，找出**匹配的评论**，对这些评论的发布者**回复**，回复内容从 #2 的固定回复列表里随机挑一条。

## 现状

- `interactWithVideo` 进评论区只检测"爱心位置"点赞（`detectCommentHearts`），评论**文字读不到**（`listComments` 返回 `text:""`）。
- 回复目前是发顶层评论（`replyComment` 点底部输入框），**不是针对某条评论**。
- App 端有整屏 OCR（VisionOcr），可读评论文字。

## 设计

1. **OCR 评论文字 + 位置**：截图 → VisionOcr 整屏 → 过滤出评论列表区域的文字框，按行聚合成"每条评论：文字 + 该条的纵向位置（y）"。
2. **匹配**：每条评论文字与"评论匹配词"做包含匹配（用词见开放问题）。命中 → 目标评论。
3. **针对性回复**：对命中的评论，点它的「Reply」入口（TikTok 每条评论右下/长按有"回复"，回复会 @该用户）→ 弹出输入框 → 输入随机固定回复 → 发送 → 关闭。
4. 频率/上限沿用现有 `commentReplyProb` / `commentReplyMaxCount`，并受 #2 的 `postReplies` 真发开关约束。

## 难点（都需真机适配）

- **评论文字 OCR 的分行/归属**：把零散 OCR 文字框正确聚合成"一条评论"（用户名 + 正文 + 时间 + 点赞数混在一起），并定位每条的可点击"回复"位置。
- **"回复某条评论"的交互**：和发顶层评论不同——要点到**该条评论的回复按钮**（位置随评论高度浮动），再输入。需截图定位每条评论的"Reply"文字/区域。
- 评论区可滚动：是否要下滑加载更多评论再匹配？（先只处理首屏可见评论，见开放问题。）

## 执行步骤

1. **前置**：#2 完成（固定回复列表就绪）。
2. **评论解析** `parseComments(boxes)`：把 VisionOcr 框聚合成 `{author, text, y, replyAnchor}[]`（先用纵向聚类 + 用户名/正文启发式）。**真机截图离线调**。
3. **匹配逻辑**：`matchComment(text, words)`。
4. **针对性回复动作** `replyToComment(anchor, text)`：点该条"回复"→ 输入 → 检测发送键发送 → 收键盘。坐标真机调（结合历史评论区截图）。
5. **接进 common.ts**：命中正向词的视频 → 进评论区 → `parseComments` → 对匹配的前 N 条 `replyToComment`（受概率/上限/`postReplies`）。
6. **REPL/调试**：`comments`（OCR 打印解析出的评论列表）、`replyc <i>`（对第 i 条回复）便于真机调。
7. 真机边测边调聚类阈值与坐标。

## 依赖 / 顺序

- **依赖 #2**（回复列表）。建议 **#2 → #4 → #3** 顺序（#4 让评论区操作更稳）。

## 风险 / 注意

- VisionOcr 只配了 `en-US`：英文评论 OK；若目标受众评论含中文/其它语言，要加识别语言（`["en-US","zh-Hans"]`）→ 确认目标语言。
- 针对性回复比顶层评论风控更敏感（@真人）→ 严格受频率/上限/`postReplies` 控制，先小流量验证。
- 评论区布局会随 TikTok 版本变 → 解析/坐标可能要随版本维护。

## 开放问题

- **"匹配的评论"用什么词**？复用正向关键词 `posPrompts`，还是单独配一份"评论匹配词"？（建议单独一份，更精准；但也可先复用 posPrompts。）
  A: 单独一份吧， 加一个设置, 注意其他部分会不会也要相应的修改文档
- 只处理**首屏可见评论**，还是要**下滑加载**更多再匹配？（首屏最稳，建议先首屏。）
  A: 先首屏
- 回复是**针对该条评论（@该用户）**，还是发**顶层评论**就行？（你需求写的是"回复这些用户"，理解为针对该条 @ 用户。确认。）
  A： 针对该条评论做回复
- 评论语言（决定 OCR 识别语言）。
  A : 默认先英语

## 补充：评论匹配词做成独立设置（回应反馈，含连带改动）
- 新增参数 **`commentMatchKeywords: string[]`**（独立于 `posPrompts`）。
- **"其他部分也要相应修改"清单**：
  - `src/params/types.ts` / `defaults.ts` / `parse.ts`（`fromLegacy` + `validateParams`）加该字段。
  - 设置 UI 加"评论匹配词"输入（多行/逗号分隔）。
  - **#1 管理中心批量设置**的配置 schema（抽到 `packages/shared` 的 `AutomationParams`）要含此字段——三端共用。
  - **#2 的 `{user}` 占位符**依赖本需求 OCR 出的评论作者 → `parseComments` 必须解析出 `author`，回复时把 `{user}` 填成 `@author`。
- 匹配逻辑：评论文字含**任一** `commentMatchKeyword` → 命中 → 对该评论 **@作者**回复（从 #2 列表随机取一条 + 展开占位符）。受 `commentReplyProb` / `commentReplyMaxCount` / `postReplies` 控制。
- 默认 OCR 语言 `en-US`（已确认）。
