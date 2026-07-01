# telemetry —— 自建轻量第一方埋点

给 **autotk / management-center / license-server** 三套系统加统一遥测。
自建、国内可访问、数据自有、只收匿名数据（无 PII）。

## 结构
- `packages/telemetry-sdk/` —— `@telemetry/sdk`：纯 TS 客户端，三端共用（RN / Node / 浏览器）。
  `track(name, props)` → 批量上报 + 离线兜底 + 匿名 id + 失败重试。
- `services/telemetry-collector/` —— `@telemetry/collector` 采集服务：`POST /v1/events` 入库（Postgres）。端口-适配器写法，核心逻辑可单测。
  - `GET /health`、`GET /v1/stats`（总条数，看板雏形）。
  - 本地试跑（内存）：`PORT=4100 pnpm --filter @telemetry/collector start`
  - 生产：`cd services/telemetry-collector && docker compose up`（自动建表 + Postgres 持久卷）。
- 看板（待做）。

## 设计原则
- **不收 PII**：只用匿名安装 id（`anonId`）+ 会话 id；事件 props 由各系统按需填，约定不放手机号/账号等。
- **不影响主流程**：上报失败只缓冲/丢弃，绝不抛给业务；可注入 fetch/storage/时钟以便测试与跨端。
- **离线安全**：失败的批次放回队列（有上限），下次再发。

## 现状
- ✅ SDK 完成（node:test 8）。
- ✅ collector 完成（node:test 6：归一化/ingest + 真 HTTP）+ Docker/compose + 自动建表。SDK↔collector 真启动 smoke 过。
- ✅ 三端接入：autotk（`apps/mobile`）/ 桌面端（`apps/desktop`）/ license（`services/license`）均已 vendored SDK + 入口 `initTelemetry()`（vendored 副本改动需手动同步，见根 CLAUDE.md 耦合缝表）。
- ⬜ 管理中心 Hub（`services/hub`）未接；统一看板待做。
