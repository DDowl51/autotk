# 方案：扫码装机（OTA 超级签）

> 目标：手机**扫码 → 点两下 → 装好 WDA / autotk**，全程不碰电脑，复刻 AScript 的「扫码即装」体验。
> 路线：**个人付费账号 + ad-hoc + 自动 UDID 注册 + 多账号池（超级签）**。合法、证书 1 年稳定，
> 唯一限制：每账号 100 台/年（多账号堆叠突破）、设备首次点一下装采集描述文件。
> 状态(2026-06-30)：**规划，未开工**。按「一件一件做、每件测过再下一件」推进。

---

## 0. 边界与诚实前提（先读）

- **个人账号做不到「任意陌生机免注册」**——那是企业证书（$299/年 + 公司 D‑U‑N‑S，且被 Apple 周期性吊销）。
  本方案是「超级签」：体感接近，但本质是 **ad-hoc + 设备自动注册**，受 100 台/账号/年 约束。
- **扫码只省「下载+安装」**。两件系统强制的事省不掉：① 首次到「设置 → 通用 → VPN与设备管理」**信任开发者证书**；② 开**开发者模式**。
- **WDA 特殊**：装上后要真正**跑**起来仍需挂开发者镜像（`go-ios image auto`，每次开机一次，需电脑/脚本）。
  扫码解决的是 WDA 的**安装**。**autotk 是普通 App，扫码装完直接能开**，不需要镜像。
- **超级签账号有被 Apple 风控封号的风险**（批量注册设备）。账号池要预留备用账号、别把所有机押一个账号。
- **域名**：用子域名 `install.<你的域名>`，不动现有站点；TLS 走泛域名证书或给子域名单签 Let's Encrypt。
  `itms-services` 强制 HTTPS + 受信任证书，http/自签都不行。

---

## 1. 容量模型：账号池（N=1 即单账号版）

- 每个开发者账号 = **100 台 iPhone / 会员年**，续费才重置；中途删设备不释放名额。
- 池 = N 个账号，新设备**自动分配到还有空位的账号**。容量 = 100 × N。1000 台 ≈ 10 账号。
- **关键效率点**：ad-hoc 描述文件内含「该账号已注册的所有 UDID」。给某账号**新增一台**设备 →
  重生成该账号 profile（含其全部 UDID）→ 该 app **重签一次**即可，**该账号下所有设备共用这份签名 IPA**；
  已装的老设备**无需重装**（它们的 UDID 仍在新 profile 里）。
  ⇒ 签名产物按 **(app, 账号, profile 版本)** 缓存，不是 per-device。新增设备才触发该账号一次重签。
- 单账号场景：`accounts.json` 里只放一个账号，**同一套代码**，无分支。

---

## 2. 端到端流程

```
①扫码 → install.xxx/ota/<app>              （Safari 落地页，<app>=wda|autotk）
②点「安装」→ 下载签名版 enroll.mobileconfig （Profile Service 采集描述文件，带 session）
③iOS 安装该描述文件 → 设备把【PKCS#7 签名的 plist（含 UDID/型号/系统版本）】POST 回
        /ota/enroll-callback?s=<session>
④Hub 回调：验签取 UDID → 选有空位的账号 → ASC API 注册 UDID（已注册则跳过）
        → 重生成该账号 ad-hoc profile → zsign 重签该 app 的 IPA（按账号缓存，命中则不重签）
        → 把 session 标记为 ready，记下 udid→账号→签名产物
⑤落地页轮询 /ota/<app>/status?s=<session> → ready 后显示
        itms-services://?action=download-manifest&url=https://install.xxx/ota/<app>/manifest.plist?s=<session>
⑥点链接 → iOS 装 App → 首次到 VPN与设备管理 信任证书（+开发者模式）→ 打开
```

> ③→⑤ 的 Profile Service 回跳细节（回调响应能否直接把 Safari 弹回安装页）**真机必调**；
> 因此⑤额外用「落地页轮询 status」兜底，不依赖回调自动回跳。

---

## 3. 模块拆分（纯逻辑优先、可单测）

放在 `management-center/services/hub/src/ota/`。每个适配器都走端口接口，编排逻辑用假实现单测。

| 文件 | 性质 | 职责 | 测试 |
|---|---|---|---|
| `manifest.ts` | 纯 | 生成 OTA `manifest.plist`（bundleId/version/title/ipaUrl/icon）| 单测 plist 文本 |
| `enroll-profile.ts` | 纯 | 生成 Profile Service `.mobileconfig`（带 callback+session）；解析设备回传 plist 取 UDID | 单测生成 + 解析样本 |
| `account-pool.ts` | 纯 | 账号池模型：`pickAccountFor(udid)` —— 已含该 udid 的账号优先；否则挑剩余额度最多的；满了返回 null | 单测：已注册/有空位/池满 |
| `signing-orchestrator.ts` | 纯编排（注入端口）| 核心：udid+app → 选账号 →（未注册则）注册+重生 profile → 重签（按账号缓存命中则跳过）→ 产出 manifest+ipa 引用 | 单测全流程（假 ASC/假 resign/假 store）：已注册跳过、池满报错、缓存命中 |
| `ports.ts` | 接口 | `AscPort`(registerDevice/listDevices/regenProfile)、`ResignPort`(sign)、`OtaStorePort` | — |
| `asc-client.ts` | 适配器 | App Store Connect API：JWT(p8 签) → 注册设备 / 列设备 / 重生成 ad-hoc profile / 下载 profile | 真机/联调 |
| `resign.ts` | 适配器 | 包 `zsign`：ipa + p12 + 密码 + mobileprovision → 签名 ipa（shell-out）| 真机/联调 |
| `ota-store.ts` | 适配器 | 落盘签名 IPA + manifest + session 状态；按 (app,账号,profile版本) 缓存 IPA；session→token 映射 | 轻量单测+联调 |
| `mobileconfig-sign.ts` | 适配器 | 用证书给 `.mobileconfig` 加签（`openssl smime -sign`），让描述文件显示「已验证」 | 联调 |
| `qr.ts` | 纯/轻 | 生成落地页二维码（SVG，零依赖或一个小库）| 单测 SVG 非空 |
| `ota-http.ts` | 路由 | 仿 `handleRelay`：命中 `/ota/...` 处理返回 true，否则 false | 集成测（仿 relay.test）|

**HTTP 路由**（`ota-http.ts`，挂在 `main.ts` 的 `createServer` 里，`handleRelay` 之后）：

```
GET  /ota/:app                       落地页 HTML（扫码入口；含轮询脚本）
GET  /ota/:app/enroll.mobileconfig   签名版 Profile Service 采集描述文件（带 session）
POST /ota/enroll-callback?s=...       设备回传签名 plist → 取 UDID → 触发 orchestrator
GET  /ota/:app/status?s=...          { state: pending|ready|full|error }
GET  /ota/:app/manifest.plist?s=...  per-session manifest（指向该会话对应账号的签名 ipa）
GET  /ota/ipa/:token                 签名 IPA 字节（token 防遍历）
GET  /ota/:app/qr.svg                落地页二维码
```

---

## 4. 配置与持久化（`HUB_DATA_DIR`）

`accounts.json`（账号池，**含敏感凭据，文件权限 600、不入库 git**）：
```jsonc
[{
  "name": "acct-1",
  "asc": { "keyId": "...", "issuerId": "...", "p8Path": "secrets/acct1.p8" },
  "signing": { "p12Path": "secrets/acct1.p12", "p12Pass": "...", "certName": "..." },
  "capacity": 100,
  "apps": { "wda": { "bundleId": "com.ddowl.WebDriverAgentRunner.xctrunner" },
            "autotk": { "bundleId": "com.ddowl.autotk" } }
}]
```
`ota-devices.json`（注册过的设备，避免重复注册、统计额度）：`{ udid: { account, registeredAt, apps:{wda:{...},autotk:{...}} } }`
`apps/`：放各 app 的**未签名母包** `wda.ipa` / `autotk.ipa`（autotk 母包由 Mac `expo prebuild` 出，见收尾清单）。

---

## 5. 与现有 Hub 的接线

- `main.ts`：`createServer` 回调里 `if (handleRelay(...)) return; if (handleOta(...)) return; 426`。
- 复用 `RelayStore` 的「TTL + 内存上限」思路做 `ota-store` 的临时 token（签名 IPA 落盘，token 内存映射）。
- 埋点（接已有 telemetry collector）：`ota_scan` / `ota_enroll`{app} / `ota_udid_captured` / `ota_sign`{ok,cached} / `ota_install_manifest_served` / `ota_pool_full`。看扫码漏斗 + 池容量水位。
- 桌面管理中心（可选，二期内）：新增「装机」页——展示二维码、各账号额度水位、已注册设备列表。**先做 Hub 后端 + 落地页**，桌面页后置。

---

## 6. 真机/联调验收点（写进《真机与上线收尾清单》）

- [ ] 子域名 `install.xxx` + TLS 通；`itms-services` 在真机 Safari 能拉起安装弹窗
- [ ] `.mobileconfig` 真机安装显示「已验证」（签名链对）+ 回调真的收到 UDID
- [ ] ASC API：用一个具 device 注册权限的 key 跑通「注册设备 + 重生成 ad-hoc profile + 下载」
- [ ] zsign 用「ASC 重生成的 profile + 对应 p12」签出的 ipa，OTA 装到**该 UDID 设备**能装、能开
- [ ] 同账号**第 2 台**设备：profile 重生成后，**老设备不需重装**仍可用；新设备共用同一签名 ipa
- [ ] 池满（额度=0）→ 落地页提示「暂无名额」+ `ota_pool_full` 埋点
- [ ] WDA 装完仍需 `go-ios image auto` 才能跑（确认这条边界对用户透明）
- [ ] autotk 装完直接可开（无需镜像）

---

## 7. 交付顺序（每步测过再下一步）

> 进度(2026-06-30)：独立项目 `signing-station/` 已立（不在 management-center 里）。

1. ✅ `manifest.ts` + `account-pool.ts` + `enroll-profile.ts`（纯逻辑 + 单测）
2. ✅ `ports.ts` + `signing-orchestrator.ts`（编排 + 假端口单测；全分支覆盖，累计 33 测过 + typecheck 过）
3. ✅ `ota-store.ts` + `ota-http.ts`(Fastify) + 落地页 HTML（inject 全链路集成测；累计 39 测过 + typecheck 过）
4. ✅ 适配器 `asc-client.ts` / `resign.ts` / `mobileconfig-sign.ts` / `qr.ts`（纯拼装+注入IO测；真打 Apple/zsign 留联调。累计 55 测过 + typecheck 过）
5. ✅ `config.ts`(校验) + `telemetry.ts`(接 collector /v1/events) + `device-plist.ts`(PKCS#7 解签) + `main.ts` 接线（71 测过 + typecheck 过 + `tsx src/main.ts` 实测起服、落地页 200）
   - ✅ 账号设备集落盘 `ota-devices.json`（device-persistence.ts，重启不丢额度账，75 测过）
   - ✅ 部署件：`Dockerfile`(多阶段含 zsign 构建) + `Caddyfile`(自动 TLS) + `docker-compose.yml` + `.dockerignore`
   - ✅ 启动实测：`tsx src/main.ts` 起服、路由正常、一路打到 ASC 边界（假凭据在此止于 DECODER，符合预期）
6. 真机联调（第 6 节清单）← **剩这一块，需你的真实凭据/Caddy/真机**（清单见 README）
7. （可选）桌面「装机」页

---

## 8. 风险与未决

- **超级签账号风控**：批量注册设备可能被 Apple 标记/封号；预留备用账号、控制单账号注册频率。
- **Profile Service 回跳**：③→⑤ 的设备端回跳行为各 iOS 版本有差异，靠⑤轮询兜底；真机定。
- **mobileconfig 签名信任链**：用什么证书签描述文件（域名 TLS 证书链 vs Apple Dev 证书）真机验「已验证」。
- **ASC API key 权限**：注册设备/管理 profile 需 Admin 或 App Manager 生成的 key；每账号一把 p8。
- **autotk 母包**：需 Mac `expo prebuild` 出未签名 ipa 才能进 OTA（WDA 母包已有，云编译产物）。
- **量级未定**：先做「池版（N 可为 1）」，单账号直接配一个账号即可，无需改码。
