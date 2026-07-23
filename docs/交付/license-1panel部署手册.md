# license · 1Panel 部署手册（前端 + 后端，一台服务器）

在一台装了 **1Panel** 的**海外/香港**服务器上，部署 License 前后端并绑定一个子域：

| 组件 | 域名 | 说明 |
|---|---|---|
| license 后端 api + 数据库 | —（内网 3001） | NestJS + Postgres，Docker |
| license 前端后台 | `license.ddowl.tech` | React 静态站（同域反代到 api） |

> 海外/香港服务器 **免 ICP 备案**。`.net` 域名 + 1Panel 自带 Let's Encrypt，全程免费证书。
> 通用/Caddy 版看《license-部署手册.md》；这份专讲 1Panel + 真实域名。
>
> **当前接入边界（2026-07-20）**：autotk 2.0 MVP 不接 License；旧 `apps/mobile` 及其 expo-updates OTA 已退役，`services/update-server` 当前没有服务对象，**不要随本手册部署**。主线部署见 [`../真机部署手册.md`](../真机部署手册.md)。

---

## 0. 铁律（否则登录不了 / 客户端激活不了）

1. **同源**：前端后台和 `/admin`、`/v1` 必须都在 `license.ddowl.tech` 下（前端写死相对路径、后端无 CORS）。
2. **只准一层反代**：后端 `trust proxy=1`，用 1Panel 的 OpenResty 这一层就够，**别再套第二层 nginx**（否则登录限流按代理 IP 算）。
3. **`/v1` 也要反代**：接入 License SDK 的消费端走 `https://license.ddowl.tech/v1/activate`。

---

## 1. 前置（域名 + 服务器 + 防火墙）

1. **DNS**：在 `ddowl.tech` 的解析后台加一条 A 记录，指向服务器公网 IP：
   | 主机记录 | 类型 | 值 |
   |---|---|---|
   | `license` | A | 服务器公网 IP |
2. **防火墙 / 云安全组**：只放行 `22`、`80`、`443`。
   ⚠️ `80` 必须开（Let's Encrypt 走 80 验证）；⚠️ **别对公网开** `3001`/`55432`（只给同机反代用，compose 已绑 `127.0.0.1`）。
3. **验证解析**：`nslookup license.ddowl.tech` 返回你的 IP 再往下。
4. **装 1Panel**（若未装）：按官网一键脚本；确认「容器」里 Docker 正常。

## 2. 把代码拉到服务器

用 1Panel 的**终端**或 SSH：
```bash
# 私有仓库：把 <PAT> 换成你的 GitHub 个人访问令牌（或用 SSH deploy key / 直接上传文件夹）
git clone https://<PAT>@github.com/DDowl51/autotk.git /opt/autotk
cd /opt/autotk
```

---

## 3. license 后端（db + api）

```bash
cd /opt/autotk/services/license

# 建 .env（和 docker-compose.yml 同目录）——一键生成随机密钥，避免忘替换占位符导致密钥可预测
[ -f .env ] || printf 'JWT_SECRET=%s\nPOSTGRES_PASSWORD=%s\n' "$(openssl rand -hex 32)" "$(openssl rand -hex 16)" > .env
cat .env    # 抄下来存好
# ⚠️ .env 生成一次就固定别再重跑：JWT_SECRET 变了已发的管理端 token 全失效；
#    POSTGRES_PASSWORD 变了会连不上已初始化的库（密码只在建库那次生效）。换机迁移把 .env 一起带走。

docker compose up -d --build          # 起 db + api；api 绑 127.0.0.1:3001，Postgres 不对外
docker compose ps                     # 等 db 显示 healthy、api 为 running
```
建管理员：
```bash
docker compose exec -e ADMIN_USER=admin -e ADMIN_PASS='强密码' api node dist/seed.js
```
自检：`curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3001/admin/me` 返回 `401`（没带 token 是对的，说明 api 活着）。

## 4. license 前端（静态站，就地构建）

前端不依赖后端源码，用一次性 node 容器就地打包，免在宿主机装 node：
```bash
cd /opt/autotk/apps/web
docker run --rm -v "$PWD":/app -w /app node:20-slim sh -c "npm install && npm run build"
# 产出 /opt/autotk/apps/web/dist —— 稍后 1Panel 网站根目录指到它
```

## 5. OTA 状态

旧 `apps/mobile` 已退役，当前仓库没有消费 expo-updates 的真机端；因此不创建 `autotk-ota` 域名、不启动 `services/update-server`，也不上传 JS 热更包。若未来有新的消费端，需先为它重新定义 runtimeVersion、签名和真机 Release 验收，再单独恢复该服务。

---

## 6. 1Panel 建网站（SSL + 反代）

### `license.ddowl.tech`（前端 + 同源反代到 api）
1. **网站 → 创建网站 → 静态网站**：主域名 `license.ddowl.tech`，根目录 `/opt/autotk/apps/web/dist`。
2. **HTTPS**：申请 Let's Encrypt 证书，开「强制 HTTPS」。
3. **伪静态**：选 SPA/history 模板；没有就填 `location / { try_files $uri $uri/ /index.html; }`。
4. **反向代理**：加两条，都指 `http://127.0.0.1:3001`：
   | 代理路径 | 目标 |
   |---|---|
   | `/admin/` | `http://127.0.0.1:3001` |
   | `/v1/` | `http://127.0.0.1:3001` |
   （1Panel 默认会带 `X-Forwarded-For` 等头；保留即可，登录限流靠它取真实 IP。）

---

## 7. 验证 + 建产品 + 建运营

```bash
# 门户
curl -sI https://license.ddowl.tech            | head -1     # 200，能打开登录页
curl -s  https://license.ddowl.tech/v1/activate -o /dev/null -w "%{http_code}\n"  # 4xx（不是 502 就说明 /v1 反代通了）
```
1. 浏览器开 `https://license.ddowl.tech` → 用 §3 的 admin 登录。
2. 有真实消费端时，在**「产品」页**建对应产品，抄下 `key` / `secret`（secret 只显示一次）。autotk 2.0 当前未接入，不要为主线部署虚构客户端验收。
3. **「账号」页**建**运营(OPERATOR)** 账号交需求方（额度池 + 可见产品；见《license-部署手册.md》4.5）。
4. 独立产品接入时使用 `packages/license-sdk` 并在该产品自身配置中注入服务地址与凭据；不要再修改或打包已退役的 `apps/mobile`。

## 8. 客户端验收边界

本手册可验 License 服务端与管理后台，但不能在没有真实消费端时把“客户端激活成功”标为通过。后续有产品接入时，至少补测首次激活、离线宽限、心跳、停用和产品 secret 轮换，并记录所用客户端版本。

---

## 9. 升级与运维

- **改后端代码**：服务器 `cd /opt/autotk && git pull` → 进对应目录重建：
  - license：`cd services/license && docker compose up -d --build`（表结构变更靠 api 启动的 `prisma db push` 自动同步）。
- **改前端**：`git pull` → 重跑 §4 的就地构建 → 覆盖 `dist`（静态站，无需重启）。
- **数据安全**：激活码/账号在 Postgres 卷 `pgdata` 里，重部署不丢；重启那几十秒手机靠 SDK 离线宽限不误踢。

## 10. 兜底与坑

- **反代 502**：1Panel 的 OpenResty 够不到 `127.0.0.1`（个别版本 OpenResty 在网桥网络）。两个改法：
  - **首选**：把该 compose 接入 `1panel-network`，反代目标用**容器名**（如 `http://services-api-1:3001`）——**完全不发布端口，最安全**。
  - 或把端口改成 `3001:3001`（发布到 `0.0.0.0`），反代目标用 `http://172.17.0.1:3001`（docker0 网关）。⚠️ 但 **Docker 发布端口会绕过 ufw/firewalld/1Panel 防火墙面板**（它插在 iptables 的 `DOCKER` 链、不走 `INPUT`）——必须在**云安全组（网络层）挡公网 3001**，或用 iptables `DOCKER-USER` 链；别以为 1Panel 防火墙面板拦住了。
- **登录 429 / 一直转**：反代叠了两层或没传 `X-Forwarded-For` → `trust proxy=1` 取不到真实 IP。确保只有 OpenResty 一层且带 IP 头。
- **api 崩、日志「拒绝启动：JWT_SECRET…」**：`.env` 没读到或还是默认值。
- **git clone 报权限**：私有仓库要 PAT/deploy key；或本地打包上传 `services/license`、`apps/web` 两个目录（去掉 node_modules/dist）。
