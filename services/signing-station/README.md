# signing-station（装机台 · OTA 超级签）

手机扫码即装 **WDA / autotk**，全程不碰电脑。自建的「iOS 应用 OTA 自助分发 + 自动 UDID 注册 + ad-hoc 重签」服务。

完整方案见 [`docs/plan.md`](docs/plan.md)。

## 它做什么
```
手机扫码 → 装采集描述文件（自动上报 UDID）
        → 注册 UDID 进开发者账号（ASC API）→ 重生 ad-hoc profile → zsign 重签 IPA
        → 落地页给出 itms-services 安装链接 → 手机直接装上
```
WDA 和 autotk 各一个入口（`/ota/wda`、`/ota/autotk`），共用同一套注册+签名流水线。

## 边界（诚实）
- 个人账号走 **ad-hoc + 自动注册**，每账号 100 台/年；多账号池横向扩容。不是企业证书的「任意机免注册」。
- 扫码省的是「下载+安装」；首次仍需**信任开发者证书** + 开**开发者模式**（系统强制）。
- WDA 装完要真正**跑**仍需 `go-ios image auto` 挂镜像；autotk 装完直接能开。

## 技术栈
TypeScript + Fastify + Caddy(自动 TLS) + zsign + `node-app-store-connect-api`/`jsonwebtoken` + `plist` + `node-forge` + `qrcode`。
核心纯逻辑自研（`src/core`，可单测），外部脏活走适配器（`src/adapters`）。

## 开发
```bash
pnpm install                          # 在 monorepo 根跑一次即可
pnpm --filter signing-station test    # vitest
pnpm --filter signing-station dev     # tsx watch src/main.ts
pnpm --filter signing-station check   # 填完 config.json 后：账号自检 + 母包体检
```

## 部署（docker compose + Caddy 自动 TLS）
```bash
cp config.example.json config.json          # 填好 baseUrl/账号/凭据路径
#  把 .p8 / .p12 / mobileconfig 签名证书放进 ./data/secrets/
#  把母包放进 ./apps/        （wda.ipa = 云编译产物；autotk.ipa = Mac expo prebuild）
#  Caddyfile 改成你的子域名，DNS 指向本机
docker compose up -d
```
- 子域名 `install.<域名>` 指向本机；Caddy 自动签 Let's Encrypt（itms-services 要求受信任 HTTPS）。
- 账号设备集落盘在 `data/work/ota-devices.json`（重启不丢额度账）。

## 真机联调清单（第 6 块，需真实凭据/真机）
- [ ] `config.json` 填真账号：ASC 的 issuerId/keyId/.p8 + 重签 p12/口令 + 各 App 的 bundleId
- [ ] 母包就位：`apps/wda.ipa`（云编译）、`apps/autotk.ipa`（`expo prebuild` 出未签名 ipa）
- [ ] mobileconfig 签名证书就位 → 真机装采集描述文件显示「已验证」
- [ ] 真机扫码：落地页 → 装描述文件 → 回传 UDID → 自动注册 + 重签 → 装上 App
- [ ] ASC 真跑通：注册设备 / 重生成 ad-hoc 或 development profile / 下 profileContent
- [ ] 同账号第 2 台：profile 重生成后老设备不需重装，新设备共用签名 IPA
- [ ] 池满 → 落地页提示「暂无名额」
- [ ] WDA 装完仍需 `go-ios image auto` 才能跑；autotk 装完直接能开
- [ ] 设备回传是 PKCS#7（DER），`openssl smime -verify` 拆 UDID 真机验
