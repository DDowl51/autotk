# 分销-产品可见性白名单 设计（2026-06-26）

## 目标
为每个分销（USER 角色）设置单独可见的产品白名单。当前设计假设分销可对任意产品发码（只见产品名）；本特性把"可见/可发码的产品"收窄为管理员显式分配的集合。

## 语义（已确认）
- 白名单是 USER（分销）的**硬边界**；**ADMIN 不受限，永远全可见**。
- **空白名单 = 显式禁发**：该分销看不到任何产品、不能发码。新建分销默认空白名单。
- 白名单同时管**发码权限**和**可见性**：从某分销白名单移除产品 A 后，该分销名下属于 A 的存量码也从其后台视图消失（**连带隐藏**）。
- 连带隐藏只影响分销在后台看到什么，**不影响客户端 `/v1/activate`**——已发的码对终端客户仍然有效。

## 数据模型（Prisma，最小改动）
新增多对多关联表：
```prisma
model AccountProduct {
  account   Account @relation(fields: [accountId], references: [id], onDelete: Cascade)
  accountId String
  product   Product @relation(fields: [productId], references: [id], onDelete: Cascade)
  productId String
  @@id([accountId, productId])
}
```
`Account` 与 `Product` 各加一个反向关系字段（`allowedProducts` / `allowedAccounts`）。其余字段不动。

## 后端（端口-适配器，沿用现有分层）
### core/domain 纯逻辑（带单测）
- `isProductAllowed(account, productId)`：ADMIN 恒 `true`；USER 看其白名单集合是否含该 productId。
- 码可见性过滤：USER 的码列表 = `ownerId = self ∩ productId ∈ whitelist`。

### 端点
- `GET /admin/accounts`（及详情）：返回每个账号的 `productIds` 白名单。
- `POST /admin/accounts/:id`：现有"改配额/停用"端点**扩展**接受 `productIds`，**覆盖式**设置白名单（与账号编辑同一弹窗）。
- `GET /admin/products`：USER 只返回白名单内产品（供发码选择器用）；ADMIN 不变。
- `POST /admin/codes`：USER 校验 `productId ∈ whitelist`，否则拒绝（reason: `product_not_allowed`）；ADMIN 任意。
- `GET /admin/codes`：USER 加白名单过滤（连带隐藏），即 `ownerId = self ∩ productId ∈ whitelist`。

### 鉴权
沿用 `AdminJwtGuard`（注入 `{id, role}`）+ USER 数据 owner 收窄；白名单收窄叠加在 owner 收窄之上。

## 配额交互（已确认规则）
被连带隐藏的存量码**仍计入**该分销配额。配额是"累计发码预算"，移除产品只收回可见性、不退还预算；避免"移除产品 → 配额凭空增加"的反直觉行为。

## 前端（apps/web）
- **账号页**：分销新建/编辑弹窗里，在配额旁加一个产品**多选**（从全部产品里勾选）。空选 = 该分销无可见产品。
- **激活码页**：USER 的"产品"选择器只列白名单产品；白名单为空时给空状态引导（"请联系管理员分配产品"）。
- 角色化：上述只对 ADMIN 配置 / 对 USER 收窄；ADMIN 自身视图不变。

## 测试（三层，沿用现有纪律）
- **unit（node:test，假数据）**：`isProductAllowed`（ADMIN/USER/空白名单）；码可见性过滤。
- **集成（vitest 打真库）**：设白名单 → USER 产品列表收窄 → 白名单内发码成功 / 白名单外发码拒绝（`product_not_allowed`）→ 移除产品后存量码连带隐藏 → 验证配额仍计入隐藏码。
- **e2e（HTTP + SDK）**：分销登录 → ADMIN 配白名单 → 分销只见这些产品 → 发码 → ADMIN 移除产品 → 码从分销视图消失但客户端 `/v1/activate` 仍有效。
- 所有既有测试保持全绿。

## 实现顺序（每片测试绿）
1. 模型（`AccountProduct` + 反向关系）+ prisma push。
2. core/domain 纯逻辑（`isProductAllowed` + 可见性过滤）+ unit。
3. 端点扩展（accounts 白名单读写、products/codes 收窄、发码校验）+ 集成测试。
4. 前端（账号页多选、激活码页选择器收窄 + 空状态）+ tsc/vite build。
5. e2e 总验 + 更新 `CLAUDE.md`（角色与权限段补"分销-产品白名单"）。
