# 需求 2：固定回复列表（去掉 AI 评论）

> **状态：✅ 已完成（2026-06-24）**。删了 src/gen/claude+smart；新增 `src/gen/fixed.ts`（随机取+占位符展开）；参数加 `fixedReplies`、删 `language`；接进 useEngine + tools；UI 在「关键词」页加"固定回复列表"、ScheduleTab 删语言字段；common.ts 空列表不发。引擎侧 tsc 通过；占位符逻辑单测通过。RN/UI 文件待 Mac 构建验证。

## 目标

手机端去掉 Claude AI 评论生成，改为**用户在设置里配置一份固定回复列表**，回复时从列表里随机挑一条。

## 现状

- 评论生成走 `src/gen/`（`makeGenerator` → Claude 或离线兜底），`common.ts` 里 `gen.reply(...)` 产出回复文案。
- 已有 `postReplies` 开关（默认只预览不发）。

## 设计

- 参数加 `fixedReplies: string[]`（一行一条）。
- 新建一个极简生成器：`reply()` 从 `fixedReplies` 随机取一条（空列表则不回复/跳过）。
- 删除 `src/gen/`（claude/smart/index）及其 Claude 依赖、`ANTHROPIC_API_KEY` 相关说明。
- `language` 参数对固定回复无意义 → 保留字段但 UI 隐藏，或直接移除（见开放问题）。

## 执行步骤

1. **参数 schema**：`src/params/types.ts` 加 `fixedReplies: string[]`；`defaults.ts` 给几条示例默认；`parse.ts` 的 `fromLegacy`/`validateParams` 处理（列表为空且开启回复时给提示）。
2. **生成器**：新建 `src/gen/fixed.ts`（或直接在 engine 内）`createFixedReplyGenerator(replies)`：`reply: async () => pick(replies) ?? ""`。返回空串时 `common.ts` 跳过该条回复。
3. **接线**：`useEngine.ts` 和 `tools/wda-cli.ts` 把 `makeGenerator` 换成固定回复生成器（用 `params.fixedReplies`）。
4. **清理**：删 `src/gen/claude.ts`、`smart.ts`、`index.ts`；移除 app.json/文档里 `EXPO_PUBLIC_ANTHROPIC_API_KEY` 相关。
5. **UI**：新增"固定回复列表"配置（多行文本，逗号/换行分隔），放在「关键词」页或新「评论回复」区；与现有 `postReplies` 开关并列。
6. **common.ts**：`gen.reply` 返回空串时不发/不预览（避免发空评论）。
7. 类型检查 + REPL `run` 验证日志里回复预览来自列表。

## 依赖 / 顺序

- 无前置依赖。**是 #3 的前置**（#3 复用这份列表）。建议**第一个做**。

## 风险 / 注意

- 固定回复重复度高 → 风控。建议：列表多备几条 + 现有 `commentReplyProb`/上限控制频率；后续可加"同一会话不重复用同一条"。
- 删 `src/gen` 别误删 engine 里对 `CommentGenerator` 接口的引用（接口保留，只换实现）。

## 开放问题

- `language` 字段是否保留？（固定回复不需要它；但 UI 上"评论回复语言"可能仍想标注。建议移除以免误导。）
  A: 不保留， 没用了就删除
- 固定回复要不要支持占位符（如随机 emoji 拼接）？默认不需要，纯列表。
  A: 最好支持一些比较简单的占位符， 你可以多想一些可能能用到的

## 补充：占位符设计（回应"支持简单占位符"）
回复模板里支持这几个轻量占位符，生成时展开（增加变体、降风控、可个性化）：
- `{emoji}` → 从一组友好 emoji 随机一个（😍🔥💯👍✨😂🙌🥰）。可写多个 `{emoji}{emoji}`。
- `{user}` → 评论作者 @用户名（#3 针对性回复时填入；非针对场景为空，自动清理多余空格）。
- `{a|b|c}` → 行内随机择一，如 `{love it|so good|amazing}` —— 一条模板能生出多种说法。
- （可选）`{kw}` → 命中的关键词本身，用于"呼应"评论。

例：`{user} {love this|so true} {emoji}` → `@tom so true 🔥`

实现：生成器选中模板后做一次占位符展开（纯字符串处理，约 30 行）；`{user}/{kw}` 由 #3 传入上下文，无上下文时置空并归一化空格。
