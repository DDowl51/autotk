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
  // 不要加 mobileconfigSigner（签名会弄断 UDID 回传，见 §11）；collectorUrl 有遥测才加
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
- `mobileconfigSigner`：**别配它**。它本想给采集描述文件加签、显示「已验证」，但实测**签名会弄断手机回传 UDID 这一步**（登记失败、安装按钮不亮），而且**并不能消除**装描述文件时那个「无效」提示——得不偿失。装机台**一律用未签名**（显示「未验证」，正常，见 §8/§11）。`config.example.json` 已默认不含此块。
- `collectorUrl`：遥测上报地址。没有就别加。

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
# ⚠️ 首次会先构建镜像（Dockerfile 从源码用 make 编译 zsign，约数分钟）——不是卡死，耐心等。
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
2. 装采集描述文件 → 设置里「已下载描述文件」→ 安装：
   - 提示「未验证」→ 点**仍然安装**（未签名，正常）；
   - 装完弹「描述文件安装失败 / 无效的描述文件」→ **这是正常的，点掉即可，不是失败**。这类采集 UDID 的描述文件本就如此：手机先把 UDID POST 给服务器（这一步已采到），再因服务器不回下一个描述文件而弹「无效」。别被它吓到。
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
- **描述文件显示「未验证」**：正常——装机台**故意不签名**（签名会弄断 UDID 回传，见 §11）。不影响登记/装 App。
- **装描述文件弹「无效的描述文件 / 安装失败」**：**正常、不是失败**（见 §8 第 2 步）——UDID 在弹错前已采到，回落地页按钮会亮。若按钮就是不亮，看 `data/work/ota-devices.json` 有没有新 UDID、或 1Panel 站点访问日志有没有 `POST /ota/enroll-callback`。
- **装 App 报「无法安装/证书不受信」**：itms 链接必须 HTTPS 且证书受信（Let's Encrypt 已满足）；或设备 UDID 没成功注册进 profile（看 preflight/日志）。
- **别对公网开 4100**：compose 已绑 `127.0.0.1`；由 1Panel 反代。

---

## 11. 附：为什么【不】给采集描述文件签名（已验证）

装采集描述文件时显示「未验证」。理论上给它签名（config 的 `mobileconfigSigner`，用一张 iOS 信任的证书）能显示绿色「已验证」。**但实测：不要这么做。**

- **签名会弄断「手机回传 UDID」这一步**——加签名后手机不再把 UDID POST 回来，登记失败、落地页安装按钮不亮。未签名反而一切正常（UDID 采到、按钮亮、能装 App）。
- **签名并不能消除那个「无效的描述文件」提示**——签了照样弹（那是这类采集 UDID 描述文件的固有尾巴，见 §8），所以毫无收益。

结论：签名只换来一个「已验证」徽章、却弄坏核心登记流程，**得不偿失**。装机台**一律用未签名**，把 §8 第 2 步的「未验证 + 无效都正常」讲给买家即可——市面所有"扫码超级签"都是这个体验。

> 你的**域名证书别浪费**——它的正经用途是 **1Panel 站点的 HTTPS**（itms 装 App 必须受信任 HTTPS，那个必须留着）；只是不拿它签描述文件而已。
