# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 这是什么

`license-saas` 是**通用激活码 / 授权 SaaS**（独立部署、多产品复用）。autotk 等产品通过 SDK 接入：启动门禁 + 心跳。与 autotk 仓库解耦，只通过 SDK 交互。

## 结构

```
services/license        后端 API @license/api（NestJS + Prisma + PostgreSQL）
packages/license-sdk    客户端 SDK @license/sdk（纯 TS，js-sha256 签名，给 autotk/未来产品）
apps/web                管理后台 @license/web（React + Vite + Ant Design + TanStack Query）
services/license/docker-compose.yml   本地一键起 db + api
services/license/docs/specs/          设计文档
```

## 常用命令

```bash
# 后端（services/license）—— 本机有 docker postgres 容器 license-pg:55432
cd services/license && docker compose up -d --build              # 起 db + api(:3001)
cd services/license && docker compose exec api node dist/seed.js # 建首个管理员 admin/admin123
pnpm --filter @license/api run test:unit   # node:test 领域逻辑（无依赖）
pnpm --filter @license/api test            # vitest 集成（打真 postgres，需 DATABASE_URL）
pnpm --filter @license/api run test:e2e    # 启服务 + 签名请求 + SDK 全栈
pnpm --filter @license/api build           # tsc 编译

# SDK（packages/license-sdk）
pnpm --filter @license/sdk test && pnpm --filter @license/sdk build

# 网页（apps/web）—— dev 时 vite 把 /admin 代理到 :3001
pnpm --filter @license/web dev     # :5173
pnpm --filter @license/web build   # tsc + vite 打包
pnpm --filter @license/web test    # vitest（纯逻辑，如 status.ts）
```

> 装新依赖若 pnpm 提示 build script 被拦截，跑 `pnpm approve-builds`（esbuild/prisma 等；常用的已列在根 `pnpm-workspace.yaml` 的 `onlyBuiltDependencies`）。

## 架构：端口-适配器（关键）

后端业务逻辑放在不依赖框架的层，便于纯单测；NestJS/Prisma 只是薄适配器。

- `services/license/src/core/` —— 纯原语：HMAC 签名(`signing`)、发码(`codes`)、激活决策(`rules`)、密钥生成(`secrets`)。只用 node:crypto，node:test 可测。
- `services/license/src/domain/` —— 业务服务（`activation`/`code-admin`/`auth`）+ **端口接口**(`ports.ts`)。只依赖端口，用假实现单测。
- `services/license/src/adapters/` —— 端口的 Prisma/jose/bcrypt 实现。
- `services/license/src/{prisma,activation,admin}/` —— NestJS 控制器/模块/守卫（薄壳，工厂把领域服务接上 DB）。

**改业务规则改 core/domain（带单测）；改接线改 adapters/控制器。**

## 角色与权限

- **ADMIN**：管产品、所有码、账号/分销、看板。不受产品白名单约束（全见）。
- **USER（分销）**：**配额内自助发码**（`Account.codeQuota`，null=不限），只看/管自己名下（`ownerId`）的码，且只在**产品白名单**内可见/发码。
- 管理端鉴权：`AdminJwtGuard` 注入 `req.account {id,role}`；ADMIN 路由 `requireAdmin`，USER 数据按 owner 收窄。
- 客户端鉴权（/v1/*）：`SignatureGuard` 用产品 secret 验 HMAC 签名（防伪/防重放）。

## 分销-产品白名单

`AccountProduct`（多对多）记录每个分销可见/可发码的产品。**硬边界**，规则纯逻辑在 `src/core/whitelist.ts`（`isProductAllowed`/`visibleCodes`，已单测）：

- **空白名单 = 显式禁发**：分销看不到任何产品、不能发码。新建分销默认空（ADMIN 在「账号」页勾选产品）。
- 收窄点：`GET /admin/products`（USER 只列白名单内）、`POST /admin/codes`（白名单外拒 `product_not_allowed`）、`GET /admin/codes`（白名单外/被移除产品的码**连带隐藏**，靠 `product.allowedBy` 关系过滤）。
- 配置：`POST /admin/accounts`（建账号带 `productIds`）、`POST /admin/accounts/:id`（**覆盖式**改 `productIds`，先 deleteMany 再 createMany）。
- **连带隐藏只影响分销后台视图**，不影响客户端 `/v1/activate`——已发的码对终端客户仍有效。被隐藏的码**仍计入配额**（移除产品不退还发码预算）。
- e2e 见 `test/admin-whitelist.mjs`（可见性收窄/发码授权/连带隐藏/配额仍计入/客户端激活不受影响）。

## key / secret（容易困惑）

每个 Product 有一对：**key 公开**（嵌客户端、随请求带）；**secret 保密**（HMAC 签名密钥，**只在创建/重置时显示一次**，服务端不再明文展示）。怀疑泄露→「产品」页重置（旧密钥立即失效）。

## 数据模型（Prisma）

`Product`(key/secret/name) · `Account`(username/passwordHash/role/codeQuota/disabled) · `ActivationCode`(code/productId/ownerId/status/maxDevices/expiresAt/note) · `DeviceActivation`(码-设备绑定/revoked 远程封禁) · `UsageLog`。

## 测试纪律

后端每个功能点配单测（core/domain，假实现）+ 集成（vitest 打真库）+ e2e（HTTP 签名请求 + SDK 全栈）。SDK 有跨实现一致性测试（js-sha256 vs node:crypto 逐字节相同）。前端逻辑抽纯函数单测（如 `status.ts`）+ tsc/vite build 验证（本机无浏览器，UI 不做自动化测试）。改完都要跑对应测试保持绿。

## 设计/视觉

后台用 Ant Design + 定制主题（`apps/web/src/theme.ts`：靛蓝品牌色、深色侧栏、Space Grotesk/JetBrains Mono），共享组件在 `apps/web/src/ui.tsx`，角色化导航在 `App.tsx`，帮助/引导在 `pages/Help.tsx` + 各页空状态/字段 tooltip。

## 用量看板 / 导出

- `GET /admin/stats?days=N`（`stats.controller.ts`，按角色收窄）→ 概览 totals、状态分布、发码/激活按日趋势。纯聚合逻辑在 `src/core/stats.ts`（`bucketByDay`/`statusBreakdown`，已单测）。
- 仪表盘 `pages/Dashboard.tsx` 用 **recharts** 画状态饼图 + 发码/激活双线趋势。
- 激活码页支持 **CSV 导出**（`src/csv.ts` 的 `toCsv`/`downloadCsv`，`toCsv` 已单测；带 UTF-8 BOM，Excel 中文不乱码）。
```
