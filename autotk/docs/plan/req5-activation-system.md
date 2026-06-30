# 需求 5：激活码系统（独立 SaaS + 防破解）

> **状态：独立系统已完成（2026-06-25），代码在 `license-saas/`（autotk 同级独立项目）。SDK 接入 autotk 是下一步。**
> 已交付：NestJS 后端(公开 activate/heartbeat + HMAC 签名守卫；管理端 login/产品/发码/停用/封设备 + JWT)、Prisma+Postgres、bcrypt/jose、首管理员 seed、Ant Design 管理后台(apps/web)、Docker(镜像+compose 全栈跑通)。测试：18 单测 + 3 集成(打真库) + e2e(签名请求 + 容器化登录)全绿。
> 技术栈：NestJS + PostgreSQL/Prisma + jose + bcryptjs + zod；React+Vite+Ant Design；Docker。防破解保持通用、不耦合产品。

> 已按反馈改为 **多产品 SaaS**，重点**防破解**。账号体系与 #1 共用；设备绑定数可配；管理员后台管码；token 用最安全本地存储；独立服务、国内可访问。

## 一、防破解（保持通用、不耦合任何产品）

**设计原则：激活系统是通用 SaaS，不懂也不碰任何产品（autotk 等）的内部逻辑/参数。** 不把 autotk 的坐标/运行参数塞进来（那会过度耦合）。

### 通用防破解基线（任何接入产品都享有）

1. **设备绑定**：码绑 `deviceId`，限制共享/超量。
2. **在线心跳 + 远程封禁**：定时心跳换短期 token；服务端可随时封某码/某设备 → 抓到破解就封。
3. **短期 token + 服务端签发**：JWT 短有效期（如 2h），靠心跳续；过期且续不上 → 失效。
4. **请求签名 + 防重放**：每请求用 product secret 做 HMAC + 时间戳/nonce，防伪造/抓包重放。
5. **客户端加固**：SDK 关键逻辑混淆、字符串加密、完整性自检、（可选）越狱检测。

### 诚实的上限

**纯客户端 App 无法 100% 防破解**——客户端的激活闸门理论上都能被 patch。上面基线的现实目标是：**挡住绝大多数普通用户 + 被破解后能远程封禁**。这对绝大多数场景够用。

### 可选的"加固通道"（通用、不耦合）

若某产品（如 autotk）将来想把破解成本进一步拉高，license 提供一个**通用的不透明 payload 通道**：

- 激活/心跳时，服务端可返回一个 **opaque 加密 blob**（license **不解析、不关心内容**），按 (product, code, device) 存取、可轮换。
- **内容完全由产品自定**：产品可以把"它运行必需的东西"放进去，使"光 patch 闸门"不足以让产品跑起来。
- **关键：这是产品侧的可选选择，license 核心保持通用。** autotk 现在**不用**，将来想加固再说，互不耦合。

## 二、SaaS 架构

独立服务 `services/license`（独立部署、国内可访问）。

### 角色 / 多租户

- **超级管理员（你）**：建产品、建/分配账号、生成激活码、全局看用量。
- **账号（客户/分销）**：登录看自己名下的码 + 用量；（可选）自己再分发。
- **产品（product）**：autotk / 未来产品；各自 `productKey + secret`，数据按产品隔离。
- **与 #1 同一套账号**：客户一个账号 → 手机激活、网页看用量、Electron 管设备 都用它。

### 数据模型（PostgreSQL + Prisma）

- `product(id, key, secret, name)`
- `account(id, username, passwordHash, role)`
- `activation_code(id, productId, code, ownerAccountId, status[未用/启用/停用], maxDevices可配, expiresAt, plan, note)`
- `device_activation(id, codeId, deviceId, productId, firstActivatedAt, lastHeartbeatAt, status)`
- `usage_log(id, deviceId, ts, event)`（在线/时长，给用量看板）

### API（REST + 签名）

- `POST /v1/activate` `{ productKey, code, account, password, deviceId, sign }` → 校验码+账号+设备数未超 → 返回 `{ token, expiresAt, entitlements, payload?(可选不透明 blob，license 不解析) }`。
- `POST /v1/heartbeat` `{ token, deviceId, sign }` → 续 token、（可选）轮换 payload、记录在线；被封则返回失效。
- 管理端：登录、码列表+用量、生成/停用/续期码、建账号（管理员）。
- 安全：HMAC 签名 + 时间戳 + nonce；token = 短期 JWT；HTTPS。

### SDK `packages/license-sdk`（TS，autotk 接入，未来产品复用）

- `createLicenseClient({ baseUrl, productKey, productSecret })`
- `activate({code,account,password,deviceId})` / `heartbeat()` / `getPayload()`(可选) / 本地安全缓存 token。
- `deviceId`：iOS `identifierForVendor`（expo-application 取）。
- token 本地存：**iOS Keychain（expo-secure-store）**——加密、随 App 删除清除，最安全的开箱方案。

## 三、autotk 接入（启动门禁）

1. App 启动 → 读 Keychain 缓存 token：有效 → 直接进 ConfigScreen；无/过期 → 进**激活页**。
2. 激活页：输激活码 + 账号 + 密码 → SDK `activate` → 存 token + runtimeConfig → 进主界面。
3. 运行中定时 `heartbeat`（顺带当 #1 的在线状态，一套连接两用）；拿到"已封禁"→ 锁回激活页。
4. **不接 payload 通道（保持解耦）**：autotk 现阶段只用"激活门禁 + 心跳 + 远程封禁"基线；将来若要加固再用通用 payload 通道，license 侧无需改、不耦合。

## 四、网页管理端

- 与 #1 / SaaS 同一前端体系：客户登录 → 「我的激活码」（码、状态、绑定设备数/上限、首次激活、最近在线）。
- 管理员：码生成（批量、设 maxDevices/有效期/归属账号）、停用、续期、账号管理、全局用量。

## 执行步骤

1. 定数据模型 + API 契约（OpenAPI）+ 签名方案 + token/runtimeConfig 设计。
2. `services/license`：DB(Prisma) + activate/heartbeat/管理 API + 签名/JWT + 封禁。
3. `packages/license-sdk`（TS）+ Keychain 缓存 + deviceId。
4. autotk：激活页 + 启动门禁 + 心跳（暂不接 payload 通道，保持解耦）。
5. 网页：客户「我的激活码」+ 管理员后台（生成/停用/续期/账号）。
6. 加固：SDK 混淆、完整性自检、越狱检测（后置，不阻塞主流程）。
7. 独立部署（国内可访问）。

## 依赖 / 顺序

- 独立，可与 #1 后端并行。账号体系与 #1 共用 → 账号模块尽量先定、两边复用。
- payload 加固通道是**可选、后置**，不影响主流程；autotk 暂不接。

## 风险 / 注意

- 防破解上限要让需求方有正确预期（见第一节）——别承诺"绝对防破解"。
- 国内可访问 + 稳定（心跳/激活是刚需）→ 部署选型重要（见开放问题）。
- 多产品隔离从一开始设计对，别写死 autotk。

## 开放问题（剩余）

- 部署在哪（云厂商/自有；国内可访问、稳定）？要不要我先用一套能国内访问的方案起骨架？
  A: 先用稳定的方案起骨架
- ~~runtimeConfig 放哪些"运行必需数据"？~~ → **方案已改：license 保持通用、不放任何产品数据**（你指出耦合过强，已采纳）。提供可选的不透明 payload 通道，autotk 暂不接；将来要加固再单独定，互不影响。
- 加固到什么程度？（混淆+完整性自检够用；越狱检测可选。）
  A：
