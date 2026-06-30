# license-saas 后台重做 + 扩展 spec

目标：把简陋的 AntD 管理后台升级为 production-grade（用 frontend-design skill），并补齐经销商/配额、账号管理、码编辑/批量、帮助等功能。分片实现，每片测试绿。

## 角色
- **ADMIN**：产品、全部码、账号/经销商、仪表盘、设置。
- **USER（经销商）**：在管理员设的**配额**内自助发码；只看自己的码 + 用量；只见产品**名**（永不见 secret）。

## 数据模型（Prisma，最小改动）
- `Account.codeQuota Int?`（null=不限；经销商给上限）
- `Account.disabled Boolean @default(false)`（停用账号）
- Code 已有 `maxDevices/expiresAt/note/ownerId`，不动。

## 后端端点
- `GET /admin/me`、`POST /admin/me/password`（本人资料 + 改密）
- `GET/POST /admin/accounts`、`POST /admin/accounts/:id`（配额/停用）、`POST /admin/accounts/:id/password`（ADMIN：管经销商）
- `GET /admin/codes`：加**产品名**（ADMIN 另加 owner）；**USER 限本人**
- `POST /admin/codes`：**USER 强制配额 + owner=本人**；ADMIN 任意
- `PATCH /admin/codes/:id`（改 maxDevices/expiresAt/note）
- `POST /admin/codes/batch/disable`（批量停用）
- `POST /admin/products/:id/regenerate-secret`（返回新 secret 一次）
- `GET /admin/stats`（仪表盘汇总）
- 鉴权：ADMIN-only 守卫 + USER 本人数据 scoping

## 前端（apps/web）
- AntD 自定义主题（品牌色/字体/间距 token、深色侧栏、品牌登录页）
- 页面：仪表盘 / 激活码（产品名列、过期选择、多选**批量停用**、**编辑**弹窗、筛选）/ 产品（secret 弹窗只显示一次 + 说明 + 复制 + **重生成**）/ 账号（ADMIN 建经销商+配额+重置密码）/ 个人中心（改密、配额用量）/ 设置（主题、API 信息、关于）/ **帮助指南**（角色相关 + 空状态引导 + 字段 tooltip）
- 导航按角色自适应

## 测试
- 后端：unit（配额、编辑、账号建）+ vitest 集成（真库：账号 CRUD、编辑、批量、配额、USER scoping）+ HTTP e2e（经销商登录→额内/超额发码→编辑→批量）
- 前端：tsc + vite build 验证（+ 一个纯工具 vitest）
- 现有测试保持全绿

## 文档
- 新增 `license-saas/CLAUDE.md`：结构、命令、端口-适配器架构、角色/配额、测试分层。

## 实现顺序
backend（模型+域+端点+测试）→ 前端主题/布局 → 页面 → 帮助 → CLAUDE.md。
