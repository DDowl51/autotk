# license-saas 管理后台改版 + 扩展 设计（2026-06-25）

## 目标
后台从“能用但简陋”升级为有设计、有引导、功能完整的多角色系统。

## 角色
- **ADMIN**：管产品、所有码、账号/分销、看板、设置。
- **USER（分销）**：**配额内自助发码**，只看自己名下的码 + 用量。

## 数据模型（Prisma，最小改动）
- `Account.codeQuota Int?` —— null=无限（管理员）；分销给正整数上限。
- 其余复用现有字段（Code 已有 maxDevices/expiresAt/note/ownerId）。

## 后端 API（services/license）
- `GET /admin/me`、`POST /admin/me/password`：个人信息 + 改密。
- `GET/POST /admin/accounts`、`POST /admin/accounts/:id`（改配额/停用）、`POST /admin/accounts/:id/password`（ADMIN 重置分销密码）。
- `GET /admin/codes`：加 **产品名**（+ admin 看 owner）；**USER 仅自己名下**。
- `POST /admin/codes`：支持有效期；**USER 校验配额 + owner=self**。
- `PATCH /admin/codes/:id`：改 maxDevices/expiresAt/note。
- `POST /admin/codes/batch/disable`：批量停用。
- `GET /admin/products`：列表不含 secret；USER 仅拿 name/id 用于发码。
- `POST /admin/products`：建产品，secret 仅此一次返回。
- `POST /admin/products/:id/regenerate-secret`：重新生成 secret（仅此一次返回）。
- 鉴权：AdminJwtGuard 注入 {id,role}；ADMIN 路由 requireAdmin；USER 数据按 owner 收窄。

### 配额规则
- 仅对 USER 生效；ADMIN 无限。
- 发码前：`已拥有码数 + 本次数量 ≤ codeQuota` 否则拒绝（reason: quota_exceeded）。

## 前端（apps/web，AntD 定制主题）
- **主题**：品牌色/字体/圆角/间距 token，深色侧栏，品牌化登录页。
- **页面**：仪表盘（概览卡）· 激活码（产品名列、有效期选择、多选**批量停用**、**编辑**弹窗、状态筛选）· 产品（建产品弹窗显示 secret **一次**并解释“这是 SDK 接入用的 HMAC 密钥，只显示一次”+复制+**重新生成**）· 账号（ADMIN：建分销+配额+重置密码）· 个人中心（改密、配额用量）· 设置（轻：主题切换/API 信息/关于）· **帮助/指南**。
- 侧栏按角色显示。

## 帮助/引导（#4）
- 帮助页（按角色：建产品→拿 key/secret→接 SDK→发码；设备数/有效期含义）。
- 空状态引导 + 字段 tooltip。

## 测试（#6）
- 后端 unit（配额、editCode、账号创建）+ vitest 集成（真库：账号 CRUD、编辑、批量、配额、USER 收窄）+ HTTP e2e（分销登录→配额内/超额发码→编辑→批量）。
- 前端：tsc+vite build 验证（+ 1 个纯工具 vitest）。所有既有测试保持绿。

## CLAUDE.md（#7）
新增 `license-saas/CLAUDE.md`：结构、命令（compose/seed/tests）、ports-adapters 架构、角色/配额、测试分层。

## 实现顺序（每片测试绿）
1. 后端（模型+账号+编辑/批量+配额+产品名+重置 secret+USER 收窄）
2. 前端主题 + 角色化布局/导航
3. 各页面
4. 帮助/引导
5. CLAUDE.md + 总验

## 假设（已与用户确认基调）
- 配额 = 账号级总码数；分销可对任意产品发码（只见产品名，永不见 secret）。
- 设置页保持轻量；个人信息在“个人中心”。
