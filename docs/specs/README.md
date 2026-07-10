# G0 规格提炼 — 规格文档索引

autotk 2.0 全新实现的**输入文档**(总纲 §13 G0)。把旧系统三类资产提炼成规格,供 G1+ 照此从零写代码,**不看旧代码**。总纲:`../autotk-2.0-架构设计总纲.md`。

## 已完成

| 文档 | 内容 | 消费方 |
|---|---|---|
| [`target-registry.json`](target-registry.json) | Target 初始注册表(50 项:22 危险 + 28 期望),声明式感知的单一数据源 | G2 感知服务 / G3 决策核 |
| [`target-registry-说明.md`](target-registry-说明.md) | 注册表 schema、字段、激活规则、数据出处、设计点 | 同上 |
| [`L0-WDA-规格书.md`](L0-WDA-规格书.md) | L0 原子层:WDA 端点、硬约束、`WdaClient` 接口、`/actions` 触控体、自愈、验收 | G1 L0 客户端 |
| [`协议规格.md`](协议规格.md) | master↔perception(/perceive、/ocr、批处理)+ master↔Hub(复用现有,D3 平铺/聚合) | G2/G5 |

## 待办(G0 剩余)

| 文档 | 内容 | 消费方 |
|---|---|---|
| `L3-业务规格.md` | `AutomationParams` 结构 + 概率模型语义(chance/jitter/分时段/四模块占比/每日一次主页);**语义照搬,代码新写** | G4 工作流 |
| `坑清单.md` | WDA×TikTok 硬约束 + 本会话所有教训汇总(弯引号/OCR 拆行/右上角误点/不盲动等),作全局 checklist | 全阶段 |

> 规格文档只描述「是什么/约束」,不含实现。批准后 G1 依 `L0-WDA-规格书` 起手写 `services/master`。
