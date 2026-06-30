# license-saas

通用激活码 / 授权 SaaS（独立部署，多产品复用）。autotk 等产品通过 SDK 接入。

## 结构（pnpm monorepo）
```
services/license   ← 后端 API（NestJS + Prisma + Postgres）
packages/sdk       ← 客户端 SDK（纯 TS fetch，给 autotk/未来产品）
packages/shared    ← 共享 zod schema / 类型（前后端 + SDK 共用）
apps/web           ← 管理后台 + 客户端口（React + Vite + Ant Design）
docker-compose.yml ← 本地一键起 postgres（+ 后端）
```

## 设计要点
- **多产品多租户**：product / account / activation_code / device_activation。数据按 product 隔离。
- **角色**：超级管理员（建产品/账号/码、全局用量）；账号（看自己名下码 + 用量）。
- **激活流程**：autotk 启动 → 激活页（激活码 + 账号 + 密码）→ `/v1/activate`（校验 + 设备绑定）→ 拿短期 token → 进主界面；定时 `/v1/heartbeat` 续期 + 上报在线。
- **安全/防破解（通用基线）**：设备绑定 + 心跳 + **远程封禁** + **HMAC 请求签名（防伪/防重放）** + 短期 JWT + 客户端加固。另留**可选不透明 payload 通道**供产品自行加固（license 不解析内容、不耦合）。
- **可配**：每个码可绑定的设备数 `maxDevices`、有效期 `expiresAt`、状态。

## 本地运行（待依赖装好后）
```bash
corepack enable pnpm          # node 自带 corepack 启用 pnpm
pnpm install
docker compose up -d db       # 起 postgres
pnpm --filter @license/api prisma migrate dev
pnpm --filter @license/api start:dev
```

## 进度
- ✅ 数据模型（Prisma schema）+ 纯核心逻辑（HMAC 签名、发码、激活规则、统计）+ 单测。
- ✅ 后端 NestJS API：客户端口（`/v1/activate`、`/v1/heartbeat`，HMAC 签名守卫）+ 管理端（产品 / 激活码增改·批量停用·导出 / 账号·分销配额停用 / stats 看板 / 个人中心）。三层测试（unit + vitest 集成 + HTTP/SDK e2e）。
- ✅ 客户端 SDK（`packages/sdk`，已构建，含跨实现一致性测试）。
- ✅ 管理后台网页（`apps/web`，React+Vite+AntD 定制主题，8 个页面、recharts 看板、CSV 导出、角色化导航）。
- ✅ Docker 化（Dockerfile + docker-compose 一键起 db + api）。
- ⬜ 分销-产品可见性白名单（见 `todo.md`）。
- ⬜ 部署/上线（CI、生产 compose、域名/TLS）+ autotk 客户端接 SDK 全链路联调。

> 详细结构、命令、架构与角色权限见 `CLAUDE.md`（最新事实源）。
