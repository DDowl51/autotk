# license + OTA · 1Panel 部署手册（前端 + 后端，一台服务器）

在一台装了 **1Panel** 的**海外/香港**服务器上，部署三样东西、绑两个子域：

| 组件 | 域名 | 说明 |
|---|---|---|
| license 后端 api + 数据库 | —（内网 3001） | NestJS + Postgres，Docker |
| license 前端后台 | `license.ddowl.tech` | React 静态站（同域反代到 api） |
| autotk OTA 更新服务器 | `autotk-ota.ddowl.tech` | expo-updates 协议，Docker（内网 4200） |

> 海外/香港服务器 **免 ICP 备案**。`.net` 域名 + 1Panel 自带 Let's Encrypt，全程免费证书。
> 通用/Caddy 版看《license-部署手册.md》；这份专讲 1Panel + 真实域名。

---

## 0. 铁律（否则登录不了 / 手机激活不了 / OTA 收不到）

1. **同源**：前端后台和 `/admin`、`/v1` 必须都在 `license.ddowl.tech` 下（前端写死相对路径、后端无 CORS）。
2. **只准一层反代**：后端 `trust proxy=1`，用 1Panel 的 OpenResty 这一层就够，**别再套第二层 nginx**（否则登录限流按代理 IP 算）。
3. **`/v1` 也要反代**：手机 autotk 激活打的是 `https://license.ddowl.tech/v1/activate`。
4. **OTA 域名永不换**：`autotk-ota.ddowl.tech` 一旦发包出去就绑死这台机（换了手机永远收不到更新）。

---

## 1. 前置（域名 + 服务器 + 防火墙）

1. **DNS**：在 `ddowl.tech` 的解析后台加两条 A 记录，都指服务器公网 IP：
   | 主机记录 | 类型 | 值 |
   |---|---|---|
   | `license` | A | 服务器公网 IP |
   | `autotk-ota` | A | 服务器公网 IP |
2. **防火墙 / 云安全组**：只放行 `22`、`80`、`443`。
   ⚠️ `80` 必须开（Let's Encrypt 走 80 验证）；⚠️ **别对公网开** `3001`/`4200`/`55432`（只给同机反代用，compose 已绑 `127.0.0.1`）。
3. **验证解析**：`nslookup license.ddowl.tech` / `nslookup autotk-ota.ddowl.tech` 返回你的 IP 再往下。
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

## 5. OTA 更新服务器（autotk-ota）

```bash
cd /opt/autotk/services/update-server
mkdir -p data/updates data/secrets

cat > .env <<'EOF'
BASE_URL=https://autotk-ota.ddowl.tech
EOF
# 不签名先跑通（app.json 当前未配 codeSigning）；要开签名见 §8

# ⚠️ 只起 update-server，别起 compose 里自带的 caddy（会和 1Panel 抢 80/443）：
docker compose up -d --build update-server
curl -s http://127.0.0.1:4200/healthz          # {"ok":true} 即成功
```
> 此刻 `curl http://127.0.0.1:4200/api/manifest` 会 400/404（还没上传任何更新包）——**正常**，等你 Mac 出包后再推（§7）。

---

## 6. 1Panel 建两个网站（SSL + 反代）

### 站 A：`license.ddowl.tech`（前端 + 同源反代到 api）
1. **网站 → 创建网站 → 静态网站**：主域名 `license.ddowl.tech`，根目录 `/opt/autotk/apps/web/dist`。
2. **HTTPS**：申请 Let's Encrypt 证书，开「强制 HTTPS」。
3. **伪静态**：选 SPA/history 模板；没有就填 `location / { try_files $uri $uri/ /index.html; }`。
4. **反向代理**：加两条，都指 `http://127.0.0.1:3001`：
   | 代理路径 | 目标 |
   |---|---|
   | `/admin/` | `http://127.0.0.1:3001` |
   | `/v1/` | `http://127.0.0.1:3001` |
   （1Panel 默认会带 `X-Forwarded-For` 等头；保留即可，登录限流靠它取真实 IP。）

### 站 B：`autotk-ota.ddowl.tech`（纯反代到更新服务器）
1. **网站 → 创建网站 → 反向代理**：主域名 `autotk-ota.ddowl.tech`，代理目标 `http://127.0.0.1:4200`（整站反代，无需静态根、无需伪静态）。
2. **HTTPS**：申请 Let's Encrypt 证书 + 强制 HTTPS。

---

## 7. 验证 + 建产品 + 建运营

```bash
# 门户
curl -sI https://license.ddowl.tech            | head -1     # 200，能打开登录页
curl -s  https://license.ddowl.tech/v1/activate -o /dev/null -w "%{http_code}\n"  # 4xx（不是 502 就说明 /v1 反代通了）
curl -s  https://autotk-ota.ddowl.tech/healthz               # {"ok":true}
```
1. 浏览器开 `https://license.ddowl.tech` → 用 §3 的 admin 登录。
2. **「产品」页**建产品 `autotk`，抄下 `key` / `secret`（secret 只显示一次）。
3. **「账号」页**建**运营(OPERATOR)** 账号交需求方（额度池 + 可见产品；见《license-部署手册.md》4.5）。
4. 回填手机端 `apps/mobile/.env`（从 `.env.example` 复制）：
   ```
   EXPO_PUBLIC_LICENSE_URL=https://license.ddowl.tech   # 已是默认样板值
   EXPO_PUBLIC_LICENSE_PRODUCT_KEY=<产品页的 key>
   EXPO_PUBLIC_LICENSE_PRODUCT_SECRET=<只显示一次的 secret>
   ```
   Mac 上 `npm run check:release` 过 → `expo prebuild` + 出带 OTA 的 Release 包。

## 8. 之后：推 OTA 热更（Mac）

app.json 已指 `https://autotk-ota.ddowl.tech/api/manifest`。每次 JS 修复：
```bash
cd apps/mobile && npx expo export --platform ios
ssh user@server 'mkdir -p /opt/autotk/services/update-server/data/updates/1.0.0'
scp -r dist/ user@server:/opt/autotk/services/update-server/data/updates/1.0.0/$(date +%F-%H%M)/
# 手机下次冷启动即拿到；服务端无需重启
```
（可选）**代码签名加固**（防更新服务器被黑/DNS 劫持推恶意 JS）：Mac 生成密钥对（见《远程更新方案.md》§3）。**顺序很重要**：先在服务器把 `private-key.pem` 放进 `services/update-server/data/secrets/`、在该服务 `.env` 里设 `CODE_SIGNING_PRIVATE_KEY=/data/secrets/private-key.pem`，再 `docker compose up -d update-server`（**必须 `up` 重建容器才会读到新 env——`docker compose restart` 不重读 `.env`**），最后才把 `certificate.pem` 填进 app.json 的 `codeSigningCertificate` 出新包。
> ⚠️ 若反了（App 带了证书、服务端却没真正加载私钥）：手机会带 `expo-expect-signature` 头来请求，服务端无私钥直接返回 500 → **热更全部静默失败、极难排查**。

---

## 9. 升级与运维

- **改后端代码**：服务器 `cd /opt/autotk && git pull` → 进对应目录重建：
  - license：`cd services/license && docker compose up -d --build`（表结构变更靠 api 启动的 `prisma db push` 自动同步）。
  - 更新服务器：`cd services/update-server && docker compose up -d --build update-server`（**带服务名**；caddy 已用 profile 守护，裸跑 `up` 也不会起它，但带上更稳）。
- **改前端**：`git pull` → 重跑 §4 的就地构建 → 覆盖 `dist`（静态站，无需重启）。
- **数据安全**：激活码/账号在 Postgres 卷 `pgdata` 里，重部署不丢；重启那几十秒手机靠 SDK 离线宽限不误踢。

## 10. 兜底与坑

- **反代 502**：1Panel 的 OpenResty 够不到 `127.0.0.1`（个别版本 OpenResty 在网桥网络）。两个改法：
  - **首选**：把该 compose 接入 `1panel-network`，反代目标用**容器名**（如 `http://services-api-1:3001`）——**完全不发布端口，最安全**。
  - 或把端口改成 `3001:3001`（发布到 `0.0.0.0`），反代目标用 `http://172.17.0.1:3001`（docker0 网关）。⚠️ 但 **Docker 发布端口会绕过 ufw/firewalld/1Panel 防火墙面板**（它插在 iptables 的 `DOCKER` 链、不走 `INPUT`）——必须在**云安全组（网络层）挡公网 3001**，或用 iptables `DOCKER-USER` 链；别以为 1Panel 防火墙面板拦住了。
- **登录 429 / 一直转**：反代叠了两层或没传 `X-Forwarded-For` → `trust proxy=1` 取不到真实 IP。确保只有 OpenResty 一层且带 IP 头。
- **api 崩、日志「拒绝启动：JWT_SECRET…」**：`.env` 没读到或还是默认值。
- **OTA 手机收不到**：① `autotk-ota` 反代/证书没通（先 `curl .../healthz`）；② 包拷错目录（必须 `services/update-server/data/updates/<runtimeVersion>/<文件夹>/`，rv 要和 app.json 的 `1.0.0` 一致）；③ 手机没冷启动。
- **git clone 报权限**：私有仓库要 PAT/deploy key；或本地打包上传 `services/license`、`services/update-server`、`apps/web` 三个目录（去掉 node_modules/dist）。
