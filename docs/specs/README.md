# autotk 2.0 规格文档索引

当前框架(core+plugin)的约束与协议入口。最初由旧系统教训提炼，现已按 2.0 实现同步。
权威总纲：[`../自动化框架-架构设计总纲.md`](../自动化框架-架构设计总纲.md)。

> 当前范围：搜索互动 / 主页互动+私信 / 关注监控 / 发布 / 评论下滑；不做推荐页养号。部署和真机测试见 [`../真机部署手册.md`](../真机部署手册.md)。

## 已完成

| 文档 | 内容 | 消费方 |
|---|---|---|
| [`target-registry.json`](target-registry.json) | 65 项 Target 的规格副本；运行时真源在 plugin 包 | 感知/决策 |
| [`target-registry-说明.md`](target-registry-说明.md) | 注册表 schema、字段、激活规则、数据出处、设计点 | 同上 |
| [`L0-WDA-规格书.md`](L0-WDA-规格书.md) | L0 原子层:WDA 端点、硬约束、`WdaClient` 接口、`/actions` 触控体、自愈、验收 | G1 L0 客户端 |
| [`协议规格.md`](协议规格.md) | master↔perception(OpenAI 兼容、单目标逐查)+ master↔Hub(D3 平铺)+ receiver | 运行时 |
| [`L3-业务规格.md`](L3-业务规格.md) | `AutomationParams` 字段树+默认值、概率模型(chance/jitter)、分时段调度、四模块流程、评论逻辑、防呆上限;**语义照搬旧引擎,代码新写** | G4 工作流 |
| [`坑清单.md`](坑清单.md) | WDA×TikTok 硬约束 + 定位/弹窗/脱困/时序全部教训(A–F),每条标「新系统哪层落地」 | 全阶段 |

> `packages/plugin-tiktok/src/target-registry.json` 是运行时 Target 真源；`docs/specs/target-registry.json` 是需逐字节同步的规格副本。
