# license 激活服务部署手册（卖家用）

> 目标：把 `services/license`（激活授权后端）+ `apps/web`（管理后台）部署到一台**国内可访问**的
> Linux VPS 上，建好 `autotk` 产品、发出激活码，并把三个值回填手机端后打正式包。
> 全程约 30–60 分钟（不含域名备案）。
>
> 前提：一个域名（如 `license.你的域名.com`）已解析到 VPS。iOS 默认禁明文 HTTP（ATS），
> 所以**必须走 HTTPS**——下面用 Caddy 自动签证书，零手工。

## 0. 事实速览（为什么是这些步骤）

- `services/license` 目录**自包含**：自带 Dockerfile + docker-compose（postgres:16 + api :3001），
  容器启动时自动 `prisma db push` 建表，**无需手动迁移**。
- 仓库**没有 .env.example**，且 `.env` 被 gitignore——VPS 上要手建（就一行 JWT_SECRET）。
- 管理员账号靠 seed 脚本手动建一次（默认 `admin/admin123`，**生产必须传强密码**）。
- 管理后台 `apps/web` 是纯静态站，接口全用相对路径 `/admin/...`，服务端**没配 CORS**——
  所以必须**同源反代**（静态站和 API 挂同一个域名下），不能分开部署。
- 客户端验签是 HMAC + 5 分钟时间戳窗口——**VPS 时钟必须 NTP 同步**，否则所有激活请求全部失败。

## 1. VPS 上部署后端

```bash
# 装 docker（一次性）
curl -fsSL https://get.docker.com | sh

# 拉代码（只需要 services/license 目录，自包含、不依赖 monorepo）
git clone <你的私有仓库> app && cd app/services/license

# 手建 .env：生成强随机 JWT_SECRET（compose 用它插值；不建则落到不安全的默认值）
printf 'JWT_SECRET=%s\n' "$(openssl rand -hex 32)" > .env

# ⚠️ 安全两件事（编辑 docker-compose.yml）：
#   1) 删掉 db 服务的 ports: "55432:5432" 映射——Postgres 不对公网暴露（默认密码是 postgres/postgres！）
#   2) api 的 3001 建议只 bind 本机："127.0.0.1:3001:3001"（反正走 Caddy 反代）

docker compose config | grep JWT_SECRET   # 确认插值成功：应是 64 位十六进制，不是 change-me-in-prod
docker compose up -d --build
docker compose logs -f api        # 看到 license API 启动日志即成功

# ⚠️ 若 api 容器反复重启、日志出现「拒绝启动：JWT_SECRET 未设置或仍为公开默认值」：
#   说明 .env 没被读到 / 写错键名 / openssl 未装导致上面那行写空 → JWT_SECRET 落到了 compose 默认值。
#   （这是有意的安全守卫：用公开默认密钥任何人都能自签管理员 token。）
#   修：确认 .env 与 docker-compose.yml 同目录、内容确为 JWT_SECRET=<64位十六进制>，再 docker compose up -d --build。

# 建管理员（幂等，重复跑不重复建；ADMIN_PASS 必须是强密码，且这是唯一入口——系统暂无强制改密，别先用默认再改）
# 若报连不上库：db 首次初始化要几秒，等 `docker compose ps` 里 db 显示 healthy 再跑（seed 幂等，重跑即可）
docker compose exec -e ADMIN_USER=admin -e ADMIN_PASS='<强密码>' api node dist/seed.js

# 时钟同步（HMAC 时间窗 5 分钟，时钟漂移=全体客户端验签失败）
timedatectl set-ntp true && timedatectl
```

## 2. 构建并上传管理后台

在开发机（本仓库根目录）：

```bash
pnpm install
pnpm --filter @license/web build          # 产物 apps/web/dist（纯静态）
ssh user@vps 'mkdir -p /srv/license-web'  # 先建目录，避免 scp 把内容错放进 /srv/license-web/dist
scp -r apps/web/dist/* user@vps:/srv/license-web/   # 让 index.html 落在 root 指向的目录第一层
```

## 3. Caddy 同源反代 + HTTPS（VPS）

用显式 `handle` 分区，避免 reverse_proxy 与 try_files 的隐式排序把 `/admin` 登录吞成 index.html：

```bash
apt-get install -y caddy
cat >/etc/caddy/Caddyfile <<'EOF'
license.你的域名.com {
  handle /admin* { reverse_proxy 127.0.0.1:3001 }
  handle /v1*    { reverse_proxy 127.0.0.1:3001 }
  handle {
    root * /srv/license-web
    file_server
    try_files {path} /index.html
  }
}
EOF
systemctl reload caddy
# 自检：走到了 API（回 400/401）而非被静态站吞成 HTML
curl -i -X POST https://license.你的域名.com/admin/login    # 应见 400/401；若回 HTML 说明反代顺序不对
```

Caddy 自动向 Let's Encrypt 签证书。打开 `https://license.你的域名.com` 应能看到登录页。

## 4. 建产品、发激活码（浏览器操作）

1. 登录管理后台（上面 seed 的账号密码）。
2. **「产品」页 → 新建产品**，名字 `autotk`。
   ⚠️ **secret 只在创建成功那一刻显示一次**，立刻抄下 `key` 和 `secret` 两个值。
   （丢了只能「重置 secret」，重置后所有已打包的客户端全部失效——等于要重新发版。）
3. **「激活码」页 → 选 autotk 产品 → 批量生成**：
   - `count`：一次最多 1000 个；
   - `maxDevices`：每码可绑定设备数（默认 1；给买家按台数发）；
   - 有效期：留空 = 永久；
   - 生成后可导出 CSV 交给买家。
   事后可单码改设备数/有效期/备注，也可批量停用（远程封禁的手段就是这个）。

## 4.5 给需求方开「运营」账号（他们自助建分销、卖激活码）

这套系统部署在**我们自己的服务器**，需求方拿到的是一个**运营(OPERATOR)账号**——权限比管理员小一档：
**不能建产品**（产品由我们 ADMIN 统一接入），但能自助建分销、给分销分发码额度、卖码。

1. 用上面 seed 的 **ADMIN** 账号登录后台 →**「账号」页 → 新建账号**：
   - **角色**选「运营」；
   - **发码配额**填这个运营的**总预算**（他自己发的码 + 分给下级分销的额度，合计不超过这个数；留空=不限，一般别留空）；
   - **可见产品**勾上他能卖的产品（如 `autotk`）——他给下级分销只能从这里面选。
2. 把用户名/初始密码交给需求方。他登录后：
   - 只能看到「仪表盘 / 我的激活码 / **账号** / 帮助 / 设置」，**没有「产品」入口**；
   - 在「账号」页建分销、给每个分销设额度（系统实时挡住超过他剩余可分配额度的分配）；
   - 也能自己直接发码。他和他建的分销、发的码，**互相隔离**，看不到别的运营的数据。
3. 需求方后续要接入新产品 → 找我们 ADMIN 建产品并勾进他的「可见产品」即可。

> 额度语义是「额度池/预留制」：给分销设 100，就从运营预算里预扣 100（不管分销用没用）。
> 想让某分销停手，把他额度改小或「停用」即可；改动实时反映在运营的「剩余可分配」。

## 5. 回填手机端并打正式包

编辑 `apps/mobile/.env`（当前是局域网开发值 `http://192.168.10.16:3001`，**必须换**）：

```bash
EXPO_PUBLIC_LICENSE_URL=https://license.你的域名.com
EXPO_PUBLIC_LICENSE_PRODUCT_KEY=<产品页的 key>
EXPO_PUBLIC_LICENSE_PRODUCT_SECRET=<只显示一次的那个 secret>
```

然后在 Mac 打包前跑校验（占位符/漏填会直接 exit 1）：

```bash
cd apps/mobile && npm run check:release
```

> 这三个值是**构建期内联进 JS** 的——改了必须重新出包（若已接 expo-updates OTA，
> 也可随 JS 热更下发，见《远程更新方案》）。

## 6. 验收清单

- [ ] `https://license.你的域名.com` 登录后台正常；
- [ ] 建好 `autotk` 产品，key/secret 已抄录到密码管理器；
- [ ] 生成一批测试激活码；
- [ ] 手机 Release 包首启 → 输入激活码 → 激活成功、能进主界面；
- [ ] 杀掉 App 重开 → 免激活直接进（token 在 Keychain）；
- [ ] 后台把该码停用 → 手机 30 分钟内（心跳周期）被踢回激活页；
- [ ] VPS `timedatectl` 显示 NTP synchronized。

## 7. 日后运维（最低限度）

```bash
# 数据库备份（激活码/绑定关系全在库里，丢了=买家全体失效），建议 cron 每日：
docker compose exec db pg_dump -U postgres license | gzip > /backup/license-$(date +%F).sql.gz

# 升级后端：
git pull && docker compose up -d --build
```

已知待加固（有意留到交付后）：管理后台无「强制首登改密」；防重放只靠 5 分钟时间窗（无 nonce 去重）；
schema 变更走 db push 无迁移历史（删改字段可能丢数据，动 schema 前先备份）。
