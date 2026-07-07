# update-server —— 自建 autotk OTA 热更服务

实现 **expo-updates 协议（protocol v1）** 的最小自建更新服务器：手机端 autotk（Release 包，
已烤进 expo-updates）启动时来这里问「有没有新 JS」，有就后台下载、下次启动生效。
JS 层的 bug（引擎逻辑、锚点、发布流程、UI）可**远程热更**，不必让买家重装。原生改动仍要重出包。

> 与 license/hub/装机台 同为**卖家自建**服务，姿态一致；买家无感。

## 磁盘布局

```
updates/
  1.0.0/                     # = app.json 的 runtimeVersion（原生兼容性版本）
    2026-07-08-1430/         # 一次发布（文件夹名随意，取 mtime 最新的那个下发）
      metadata.json          # expo export 产物
      _expo/static/js/ios/*.hbc
      assets/*
    2026-07-09-0900/         # 更新的一次发布 → 自动成为「当前版本」
```

## 发布一次热更（在 Mac 上）

> ⚠️ 拷贝目标必须是 **docker compose 挂载的目录**（下方部署用 compose，宿主机是
> `<部署目录>/services/update-server/data/updates/`，容器内 `UPDATES_DIR=/data/updates`）。
> 别拷到 `/srv/...`——那不是容器读取的目录，会导致 `/api/manifest` 恒 404、手机永远收不到热更。

```bash
cd apps/mobile
npx expo export --platform ios          # 产出 dist/（bundle + assets + metadata.json）
# 首次先在服务器建好 runtimeVersion 目录（如 1.0.0）：
ssh user@vps 'mkdir -p /srv/update-server/data/updates/1.0.0'   # 路径= compose 所在目录/data/updates
# 把 dist **内容**拷进一个新文件夹（末尾斜杠很重要，别拷成嵌套 dist/）：
scp -r dist/ user@vps:/srv/update-server/data/updates/1.0.0/$(date +%F-%H%M)/
```

服务端无需重启——下次手机来问就拿到新的（取该 runtimeVersion 下 mtime 最新的文件夹）。

> ⚠️ **runtimeVersion 必须与手机上跑的那个 Release 包一致**（app.json 里现为 `"1.0.0"`）。
> 改了原生（加原生模块/权限/升级 SDK）→ 必须**升 runtimeVersion + 重出包**，热更只能推同 runtimeVersion 的 JS。

## 代码签名（强烈建议开）

手机只执行「被卖家私钥签过」的更新，防更新服务器被黑/DNS 劫持推恶意 JS。一次性生成密钥对：

```bash
cd apps/mobile
npx expo-updates codesigning:generate-keypair \
  --key-output-directory code-signing \
  --certificate-output-directory code-signing
# 产出 code-signing/certificate.pem（打进 App，已在 app.json 引用）
#     + code-signing/private-key.pem（**只给服务器**，勿进 App、勿提交）
```

把 `private-key.pem` 放到服务器，`CODE_SIGNING_PRIVATE_KEY` 指向它。`certificate.pem` 留在
`apps/mobile/code-signing/` 随 App 一起打包（app.json 的 `updates.codeSigningCertificate` 已配好）。

## 部署（VPS）—— 推荐用 docker compose

compose（本目录 `docker-compose.yml`）已配好挂载、env 与 Caddy，是主推方式；env 走容器内 `/data` 路径，别改。

```bash
cd services/update-server
mkdir -p data/updates data/secrets                     # 更新包放 data/updates/<rv>/；私钥放 data/secrets/
cp <你的>/private-key.pem data/secrets/private-key.pem  # 代码签名私钥（勿提交）
export BASE_URL=https://updates.你的域名.com            # 必须与 app.json 的 updates.url 同域
# 改 Caddyfile 里的 updates.你的域名.com 为真实域名（DNS 指向本机、放行 80/443）
docker compose up -d --build
curl -s http://127.0.0.1:4200/healthz                  # {"ok":true} 即起来了
```

> compose 内固定：`UPDATES_DIR=/data/updates`、`CODE_SIGNING_PRIVATE_KEY=/data/secrets/private-key.pem`、
> `KEYID=main`、`PORT=4200`，分别对应宿主机 `./data/updates`、`./data/secrets/private-key.pem`。
> **裸 `node dist/main.js` 仅供本机调试**，那时 `UPDATES_DIR`/`CODE_SIGNING_PRIVATE_KEY` 用你自定义的路径，
> 且 scp 目标要与之一致——生产别混用两套路径。

Caddy（compose 内已含）反代 + 自动 TLS：`https://updates.你的域名.com` → update-server:4200。
app.json 的 `updates.url` 现为 `https://updates.你的域名.com/api/manifest`，改成你的真实域名后重出包。

## 接口

- `GET /api/manifest` —— 按 `expo-platform`/`expo-runtime-version` 头返回 multipart manifest
  （带 `expo-expect-signature` 头且配了私钥时附 `expo-signature`）。该 runtimeVersion 无更新 → 404（客户端保持当前版本）。
- `GET /assets/:rv/:folder/*` —— 下发 bundle 与静态资源（带路径穿越防护）。
- `GET /healthz` —— 健康检查。

## 测试

```bash
pnpm --filter @autotk/update-server test   # 9 测：hash/manifest/签名纯逻辑 + 服务端 multipart+验签+下发+穿越防护
```

> ⚠️ 自动化测试覆盖了**服务端产出的 manifest 格式与签名自洽**，但「真机 expo-updates 客户端
> 能否吃下这份 manifest 并成功热更」只能用**真机 Release 包**验（见 docs/交付/远程更新方案.md）。
