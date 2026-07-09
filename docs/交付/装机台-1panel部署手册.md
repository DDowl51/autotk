# 装机台 signing-station · 1Panel 部署手册

在装了 **1Panel** 的**海外/香港**服务器上部署「扫码即装 WDA / autotk」的装机台。
和 license/OTA 同一台机也行(各占一个子域)。域名假设 `install.ddowl.tech`。

| 组件 | 域名 | 内网端口 |
|---|---|---|
| signing-station | `install.ddowl.tech` | 4100 |

> 它做什么:手机扫码 → 装采集描述文件(自动上报 UDID)→ 用 **Apple ASC API** 注册 UDID + 生成 profile → **zsign 重签** IPA → 落地页给 `itms-services` 安装链接 → 手机直接装上。WDA 和 autotk 各一个入口 `/ota/wda`、`/ota/autotk`。

---

## 0. 铁律 / 边界(先知道，否则白忙)

1. **必须有 Apple 开发者账号**($99/年)。装机台是把「自动注册 UDID + 重签」自动化,但**证书/密钥是你在 Apple 侧办的**,程序办不了。
2. **个人账号 ad-hoc/development：每账号 100 台/年**。多账号池横向扩容(config 里 `accounts` 加条目)。不是企业证书那种免注册。
3. **itms-services 要求受信任 HTTPS** → 用 1Panel 的 Let's Encrypt(和别的站一样)。
4. 扫码省的是「下载+安装」;首次仍需买家**信任开发者证书** + 开**开发者模式**(iOS 强制,谁都免不了)。WDA 装完还要 `go-ios image auto` 挂镜像才能跑;autotk 装完直接能开。

---

## 1. Apple 侧准备(你在 App Store Connect / 开发者后台办)

拿到下面几样,才能填 config：

| 要什么 | 从哪拿 |
|---|---|
| **ASC API 密钥** `.p8` + `issuerId` + `keyId` | App Store Connect → 用户与访问 → 集成/密钥 → 生成 App Manager 权限的 API Key（下载 `.p8` **只给一次**，issuerId/keyId 在页面上） |
| **签名证书 `.p12` + 密码** | 开发者后台 Certificates 生成 **iOS Development 证书** → 钥匙串导出为 `.p12`（含私钥、设个密码）。**推荐 Development**（体检 preflight 只校验它，见 §10）；坚持 ad-hoc 就用 Distribution 证书 + `profileType: IOS_APP_ADHOC` |
| **注册 Bundle ID** | 开发者后台 Identifiers 注册 `com.ddowl.autotk` 和 `com.ddowl.WebDriverAgentRunner.xctrunner`（ASC 生成 profile 时要能定位到它们） |

> `.p8` 和 `.p12` 都是**凭据**，只放服务器 `data/secrets/`，**勿提交、勿外发**。

## 2. DNS + 防火墙

- `ddowl.tech` 解析加一条 A 记录：`install` → 服务器公网 IP。
- 安全组只开 `22/80/443`；**别对公网开 4100**（compose 已绑 `127.0.0.1`）。

## 3. 母包就位(两个 IPA)

代码已在服务器 `/opt/autotk`（前面 git clone 过）。把两个母包放进 `services/signing-station/apps/`：

- `apps/autotk.ipa` ← 你 Mac 上 `expo prebuild` 出的那个未签名母包（见《部署清单-完整.md》第 4 步）。
- `apps/wda.ipa` ← WebDriverAgent 云编译产物（`.github/workflows/build-wda.yml`，Xcode 14.3.1）。⚠️ 下载解压后 Artifact 叫 `WebDriverAgent.ipa`，**重命名为 `wda.ipa`** 再放入。母包**必须含 XCTest 框架**（否则装上点不开），preflight 会校验。

用 1Panel「文件」上传，或 scp 到 `/opt/autotk/services/signing-station/apps/`。

## 4. 填 config.json

```bash
cd /opt/autotk/services/signing-station
cp config.example.json config.json
```
编辑 `config.json`（下面是最小可用示例，**把 issuerId/keyId/密码换成真的**）：

```jsonc
{
  "baseUrl": "https://install.ddowl.tech",     // 必须 https，且与 1Panel 站点/DNS 一致
  "organization": "ddowl",
  "enrollIdentifier": "com.ddowl.signing-station.enroll",
  "port": 4100,
  // collectorUrl / mobileconfigSigner 没有就【整行/整块删掉】（见下方“可选项”）
  "apps": {
    "wda":    { "bundleId": "com.ddowl.WebDriverAgentRunner.xctrunner", "title": "WebDriverAgent", "version": "5.15.5", "motherIpaPath": "apps/wda.ipa", "requiresXctest": true },
    "autotk": { "bundleId": "com.ddowl.autotk",                          "title": "autotk",         "version": "1.0.0",  "motherIpaPath": "apps/autotk.ipa" }
  },
  "accounts": [
    {
      "name": "acct-1",
      "capacity": 100,
      "asc": {
        "issuerId": "你的issuerId",
        "keyId": "你的keyId",
        "p8Path": "data/secrets/acct1.p8",
        "profileType": "IOS_APP_DEVELOPMENT"   // 推荐用这个（体检只认 Development 证书；ad-hoc 见 §10）
      },
      "signing": { "p12Path": "data/secrets/acct1.p12", "p12Password": "你的p12密码" },
      "bundleIds": { "wda": "com.ddowl.WebDriverAgentRunner.xctrunner", "autotk": "com.ddowl.autotk" }
    }
  ]
}
```

> ⚠️ **config.json 是严格 JSON，不支持注释**。上面的 `//…` 只是给你看的说明——**粘贴后必须把所有 `//` 注释删干净**，否则启动报 JSON 解析错（不是「配置缺少 xxx」，别往字段填错的方向查）。用 `cp config.example.json` 后**只改值**最稳（它本身是干净 JSON）。

**必填**（缺了服务启动即报「配置缺少 xxx」）：`baseUrl`(https)、`organization`、`enrollIdentifier`、`apps`(每个 app 的 bundleId/title/version/motherIpaPath)、`accounts`(每账号 name + asc.issuerId/keyId/p8Path + signing.p12Path/p12Password + **每个 app 都要有 bundleIds**)。

**可选项（没有就删掉整块，别留空占位）**：
- `mobileconfigSigner`：给采集描述文件加签，装时显示「已验证」。**没有 S/MIME 签名证书就整块删掉** → 描述文件不签名、装时显示「未验证」但**照样能装**。留着块却没证书文件会在签名时 **500**。
- `collectorUrl`：遥测上报地址。没有就删掉这行。

## 5. 放凭据

```bash
cd /opt/autotk/services/signing-station
mkdir -p data/secrets data/work
# 把 Apple 侧拿到的两个文件放进去（名字对上 config 里的路径）：
#   data/secrets/acct1.p8    （ASC API 私钥）
#   data/secrets/acct1.p12   （签名证书）
# 用 1Panel 文件上传或 scp。多账号就 acct2.p8 / acct2.p12 …并在 config.accounts 加条目。
```

## 6. 起服务 + 体检

```bash
cd /opt/autotk/services/signing-station

# 先体检：逐账号验 ASC 连通/证书 + 母包结构（含 WDA 的 XCTest）。
# ⚠️ VPS 只有 Docker、没 Node，必须在容器里跑：
# ⚠️ 首次会先构建镜像（Dockerfile 从源码 cmake 编译 zsign，约数分钟）——不是卡死，耐心等。
docker compose run --rm signing-station npx tsx src/preflight.ts

# 体检过了再起（⚠️ 只起 signing-station，别起自带 caddy——会和 1Panel 抢 80/443）：
docker compose up -d --build signing-station
curl -s http://127.0.0.1:4100/ -o /dev/null -w "%{http_code}\n"   # 有响应(200/302/404 都行，非 000 即活着)
```
> config/凭据不对时服务启动即崩(loadConfig 抛错)——所以先 preflight 再 up。设备额度落盘在 `data/work/ota-devices.json`，重启不丢。

## 7. 1Panel 建站(install 子域 + SSL + 整站反代)

网站 → 创建网站 → **反向代理**：
- 主域名 `install.ddowl.tech`
- 代理目标 `http://127.0.0.1:4100`（整站 `/` 反代，落地页/描述文件/itms 链接都在它下面）
- **HTTPS**：申请 Let's Encrypt 证书 + 强制 HTTPS（itms-services 必须受信任 HTTPS）。

> 若反代 502（个别 1Panel 版 OpenResty 在网桥网、够不到 127.0.0.1）：同《license-1panel部署手册》§10——优先把容器接入 `1panel-network` 用容器名反代，或改 `4100:4100` 发布 + 云安全组挡公网。

## 8. 验证(真机)

```bash
curl -sI https://install.ddowl.tech/ota/autotk | head -1   # 200；根路径 / 无路由、返回 404 是正常的（别以为反代坏了）
```
拿一台**真 iPhone**：
1. Safari 开 `https://install.ddowl.tech/ota/autotk`（或 `/ota/wda`）。
2. 装采集描述文件 → 设置里「已下载描述文件」→ 安装（未签名会提示「未验证」，继续）。
3. **回到 Safari 原来那个页面（别刷新、别重开链接）** → 页面每 2 秒自动检测 → 登记完成后安装按钮**自动亮起** → 点了装上 App。
   ⚠️ 一刷新/重开就会新建会话，卡在「正在登记本机…」永远不亮——回到原页面等着就行。
4. 设置 → 通用 → VPN与设备管理 → **信任开发者证书**；隐私与安全性 → **开发者模式** 开 → 重启。

## 9. 运维

- **换母包**（出了新 autotk/WDA 版本）：覆盖 `apps/autotk.ipa` 或 `apps/wda.ipa` → **必须重启**（签名产物缓存在内存，不重启继续发旧包）：
  ```bash
  docker compose restart signing-station && docker compose run --rm signing-station npx tsx src/preflight.ts
  ```
- **扩容**：`config.accounts` 加一个账号（新 name + 新 `.p8`/`.p12` + bundleIds）→ 重启。池满时落地页提示「暂无名额」。
- **改 config.json**：用 `docker compose restart signing-station`。⚠️ config.json 是**挂载文件**，`docker compose up -d` 看不到文件内容变化、会判「up-to-date」跳过 → 新配置**不生效**；只有改**环境变量 / compose 本身**才用 `up -d`。

## 10. 常见坑

- **preflight 报 ASC 失败**：issuerId/keyId/.p8 不匹配，或 API Key 权限不足（要 App Manager）、或 bundleId 没在开发者后台注册。
- **preflight 报「开发证书 0 张」但你用的是 ad-hoc/Distribution 证书**：体检目前**只校验 Development 证书**，用 ad-hoc 会在这项显示 ✗——**可忽略**（真正签名时没有 Development 证书会自动退回用全部证书、能签成功）。省心就直接用 `IOS_APP_DEVELOPMENT` + Development 证书（默认、体检也过）。
- **母包体检失败**：`wda.ipa` 没重命名 / 不含 XCTest；`autotk.ipa` 结构不对（重出）。
- **描述文件显示「未验证」**：没配 `mobileconfigSigner`——可接受（能装），要「已验证」得配 S/MIME 证书。
- **装 App 报「无法安装/证书不受信」**：itms 链接必须 HTTPS 且证书受信（Let's Encrypt 已满足）；或设备 UDID 没成功注册进 profile（看 preflight/日志）。
- **别对公网开 4100**：compose 已绑 `127.0.0.1`；由 1Panel 反代。

---

## 11. 附：让采集描述文件显示「已验证」(mobileconfigSigner)

装采集描述文件时默认显示「未验证」（能装、只是多一次确认）。想显示绿色「**已验证**」，用一张 **iOS 信任的证书** 给描述文件签名——最省钱的就是**你 `install.ddowl.tech` 那张 Let's Encrypt 证书**（iOS 信任 LE 根）。签名用的是 `openssl smime`（CMS/PKCS#7），要三个 PEM 文件：

```bash
cd /opt/autotk/services/signing-station/data/secrets
# 从 1Panel（网站→install.ddowl.tech→HTTPS，或「证书」菜单下载）拿到 fullchain.pem + privkey.pem 放这里，然后：
cp privkey.pem mc-key.pem                    # 私钥（必须【无密码】——脚本没传 -passin，加密私钥会卡死）
awk '/BEGIN CERTIFICATE/{n++} { if(n==1) print > "mc-cert.pem"; else print > "mc-chain.pem" }' fullchain.pem
# → mc-cert.pem = 叶子证书；mc-chain.pem = 中间链
```
config.json 加回这个块（之前没证书时删掉的），再 `docker compose restart signing-station`：
```json
"mobileconfigSigner": {
  "signerCertPath": "data/secrets/mc-cert.pem",
  "keyPath": "data/secrets/mc-key.pem",
  "certChainPath": "data/secrets/mc-chain.pem"
},
```

> ⚠️ **这跟给 IPA 重签的 Apple `.p12` 是两码事**：那个签 App，这个签描述文件。
> ⚠️ **LE 证书 ~90 天自动续期**，续了之后 `data/secrets/` 这三份会变旧、过期后又变「未验证」。要么每次续证后重跑上面两步 + 重启，要么写脚本挂到 1Panel 续期钩子自动同步。
> 嫌麻烦就**不配**——「未验证」不影响注册 UDID + 重签 + 装 App 的主流程。
