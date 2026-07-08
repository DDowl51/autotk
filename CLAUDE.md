# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 这是什么

「TK 养号 + 发布自动化」系统：用 WDA 驱动 iPhone 上的 TikTok 国际版做养号/营销互动，并配套一整套服务端（管理中心、激活授权、装机、遥测）。需求源自「小明同学 TK 自动化运营助手」的**自研复刻**——只复刻功能，全自研重写，不碰原版代码。

**这是一个 pnpm monorepo**（2026-07 由原本 5 个平级目录迁入），布局 `apps/* services/* packages/*`。各子项目仍是相互独立、可分别部署的单元，且大多有**自己的 CLAUDE.md / README**（最新事实源）——本文件只给全局地图与子项目间的连线，改具体子项目前先读它自己的文档。

## 仓库布局与子项目地图

```
apps/
  mobile/              手机端核心 autotk（RN/Expo）——见下方「⚠️ 未进 workspace」
  desktop/   @mc/desktop      管理中心 Electron 桌面端
  web/       @license/web     license 管理后台（React+Vite+AntD）
services/
  hub/       @mc/hub          管理中心云 Hub（socket.io）
  publisher/ @mc/publisher    桌面端发布能力（文件夹工作流 + LAN 直传）
  license/   @license/api     激活授权后端（NestJS+Prisma+Postgres）
  signing-station/            装机台（Fastify + zsign + ASC API；OTA 自助分发）
  telemetry-collector/  @telemetry/collector   埋点采集（Postgres）
packages/
  shared/        @mc/shared       管理中心协议 + AutomationParams（hub/desktop 共用）
  license-sdk/   @license/sdk     激活 SDK（纯 TS，给 autotk/未来产品）
  telemetry-sdk/ @telemetry/sdk   埋点客户端 SDK（RN/Node/浏览器共用）
docs/management-center/           管理中心 README + dev/req 文档
```

各子项目角色一句话 + 必读文档：

| 包 | 角色 | 必读文档 |
|---|---|---|
| `apps/mobile` | **手机端核心**：WDA 驱动 TikTok 养号/评论/发布引擎 + RN/Expo 配置监控 App + Linux 调试台 | `apps/mobile/CLAUDE.md`（**动真机交互前必读**） |
| `services/hub` + `services/publisher` + `apps/desktop` + `packages/shared` | **管理中心**：云 Hub + Electron，看几百台手机、批量改设置、文件夹发视频 | `docs/management-center/README.md`、`docs/management-center/dev-phase23.md` |
| `services/license` + `packages/license-sdk` + `apps/web` | **通用激活码 / 授权 SaaS**（独立、多产品复用） | `services/license/CLAUDE.md`（必读） |
| `services/signing-station` | **装机台**：扫码即装 WDA/autotk（UDID 自动注册 + ad-hoc 重签） | `services/signing-station/README.md`、`docs/plan.md` |
| `services/telemetry-collector` + `packages/telemetry-sdk` | **自建第一方埋点**（匿名、无 PII） | `services/telemetry-collector/README.md` |

媒体/资料（非代码，勿改，已 gitignore）：根目录 `*.mp4`、`*.PNG`、`*.docx`、`参数辅助生成工具.exe`、`额外参数软件讲解/`。
`真机与上线收尾清单.md` 是全局验收清单——列出所有**仅靠真机/Mac 构建/部署才能验**的事项，问到「还差什么才能上线」先看它（其中路径仍是迁移前写法，自行换算到新布局）。

## ⚠️ apps/mobile 暂未进 root workspace

`apps/mobile`（autotk，RN/Expo）目前被 **`pnpm-workspace.yaml` 用 `!apps/mobile` 显式排除**，保留**自带的独立安装**（`apps/mobile/pnpm-workspace.yaml` + 自己的 lock/node_modules）。原因：RN 的 Metro 打包 + 原生模块 autolink 进 monorepo 需要专门配置且**只能真机/Mac 验**，属延后的「phase 4」。

- 装 / 跑 autotk：`cd apps/mobile && pnpm install`，再按 `apps/mobile/CLAUDE.md`。
- root 的 `pnpm install` / `pnpm -r` **不含** apps/mobile。
- 等做 phase 4（加 Expo monorepo 的 `metro.config.js` 并真机验）后，去掉那条排除即可纳入；同时可顺势消灭下面两处 vendored 副本。

## 子项目之间怎么连（关键全局认知）

- **mobile ↔ 管理中心**：手机端 `apps/mobile/src/hub/`（HubClient/reporter/configInbox）连云 Hub，上报状态/日志、收批量配置、收发布任务。协议两边各一份（`apps/mobile/src/hub/protocol.ts` 与 `packages/shared`），**不是同一份代码，改协议要两边同步**。手机用 `EXPO_PUBLIC_HUB_URL` 指向 Hub。
- **mobile ↔ license**：手机端 `apps/mobile/src/license/` 通过 **vendored 的 license SDK** 做激活门禁 + 心跳。**改 `packages/license-sdk` 后需手动同步 vendored 副本到 `apps/mobile/src/license/sdk/`**（mobile 未进 workspace，暂时无法靠 workspace 依赖自动联动——phase 4 后可改为真正依赖、删副本）。上线前要在 license 后台建 `autotk` 产品，把 key/secret 填进 mobile config/.env。
- **signing-station** 产出/分发的是 autotk 与 WDA 的 IPA 母包（`apps/wda.ipa` 云编译、`apps/autotk.ipa` 由 Mac `expo prebuild`）。不依赖其它包运行，但服务于 autotk 真机落地。
- **telemetry** 是横切：三端各自 vendored/接入 `@telemetry/sdk`。**方案已定（P4）：自建 collector、匿名无 PII、静默卖家遥测——买家侧无看板、无配置入口**（桌面原「数据看板」页 + 设置「埋点采集地址」已删）。`apps/mobile`/`apps/desktop`/`services/license` 三端已接入并在发（各自 env 开关 `EXPO_PUBLIC_TELEMETRY_URL`/`VITE_TELEMETRY_URL`/`TELEMETRY_URL`，未设则 no-op）；**仅 Hub 尚未接**。SDK 三份副本仍待 phase 4 收编。
- **账号体系**：管理中心 Hub 与 license **各自独立、不共用、不同步**（早期曾设想同一套，已废弃）。

## 跨项目通用约定

- **改一处必须保证关联处仍能跑（强约束）**：这些包通过协议/SDK/IPA 母包/埋点互相咬合，**不允许改了一边导致另一边跑不起来**。改「源」必同步「副本/消费方」（下表状态已用代码核实）：

  | 耦合缝 | 源 | 副本/消费方 | 状态 | 改动纪律 |
  |---|---|---|---|---|
  | Hub 协议 | `packages/shared/src/protocol.ts`（全量 16 事件） | `apps/mobile/src/hub/protocol.ts`（设备侧子集 7 事件）+ `services/hub/src/gateway.ts` 消费 | 有意漂移（手机端只留子集，不含 operator 事件） | 改**设备侧**事件才需三处同步 shared→mobile→gateway；跑 `pnpm --filter @mc/hub test` |
  | license SDK | `packages/license-sdk/src/`（`@license/sdk`） | vendored `apps/mobile/src/license/sdk/`（client/errors/signing/storage 四文件） | 漂移（逻辑同，仅注释/导入风格异） | 改后**整文件拷**到手机端；跑 `pnpm --filter @license/sdk test` |
  | telemetry SDK | `packages/telemetry-sdk/src/`（`@telemetry/sdk`） | vendored 三份：`apps/mobile`/`apps/desktop`/`services/license` 各 `src/telemetry/sdk/`（**Hub 尚未接**） | 当前逐字节同步 | 改后拷到**三个**副本；各端入口 `initTelemetry()` |
  | IPA 母包 | Mac `expo prebuild`（autotk）/ 云编译（WDA） | `services/signing-station/apps/*.ipa`（母包入口 + `requiresXctest`） | 二进制，gitignore | 改 autotk 产物形态 → 对齐母包入口；WDA 母包必须含 XCTest，`pnpm --filter signing-station check` 会校验 |
  | Hub 端口表 | `apps/desktop/electron/netutil.cjs` 的 `HUB_PORTS`（内嵌 Hub 按此表挑第一个空闲端口） | `apps/mobile/src/hub/hubUrl.ts` 的 `HUB_PORTS`（手机端口兜底重连按同表扫） | 必须逐一致 | 改一处两处同步；跑 `pnpm --filter @mc/hub test` + 手机 `bash tests/run.sh` |
  | 标定档结构 `DeviceProfile` | `apps/mobile/src/engine/onDeviceUI.ts`（App 侧） | `apps/mobile/tools/deviceProfile.ts`（REPL/标定侧） | 手动同步 | 改字段两处同步；页面锚点比例是**单一真源** `src/engine/anchors.ts`（两边 import，无副本）；跑手机 `bash tests/run.sh` |

  根因：`apps/mobile` 被 `!apps/mobile` 排除出 workspace，无法用 workspace 依赖联动，故只能 vendored + 手动同步；phase 4 收编后可删这些副本。改完把**两边的测试都跑一遍**确认仍绿，并在回复里说明波及到了哪些包。
- **架构基调到处是「端口-适配器」**：纯业务逻辑放不依赖框架的 `core`/`domain`（用假实现单测），框架/外部脏活（Prisma、HTTP、zsign、socket.io、ImageMagick）放 `adapters`。**改规则改核心层并补测，改接线改适配器。**
- **测试纪律**：纯逻辑都有自动化测试，回归靠各包测试；真机/Electron/Postgres 相关的接线层只能在对应运行时验（见 `真机与上线收尾清单.md`）。改完跑对应测试保持绿。
- 装新依赖若 pnpm 提示 build script 被拦截，跑 `pnpm approve-builds`（esbuild/electron/prisma 等；常用的已列在 `pnpm-workspace.yaml` 的 `onlyBuiltDependencies`）。

## 常用命令

```bash
# ---- root（pnpm monorepo，不含 apps/mobile）----
pnpm install                         # 装全部 workspace 成员
pnpm -r --if-present test            # 递归跑各包测试（注意：license vitest 集成需 Postgres）
pnpm --filter @mc/hub test           # 跑单个包

# ---- 管理中心 ----
pnpm --filter @mc/hub start          # Hub :4000
pnpm --filter @mc/hub mock -- d1 手机1        # 没真机时模拟设备
pnpm --filter @mc/desktop dev:renderer        # vite :5173；再 VITE_DEV_SERVER_URL=... pnpm --filter @mc/desktop electron
pnpm --filter @mc/publisher build    # desktop 的 electron 主进程 require 它的 dist，需先 build

# ---- license（本机 docker postgres 容器 license-pg:55432）----
cd services/license && docker compose up -d --build   # db + api :3001
pnpm --filter @license/api run test:unit   # 领域逻辑（无依赖）；test 打真库；test:e2e 全栈
pnpm --filter @license/web dev             # 管理后台 :5173

# ---- signing-station ----
pnpm --filter signing-station test   # vitest
pnpm --filter signing-station dev    # tsx watch src/main.ts

# ---- telemetry ----
pnpm --filter @telemetry/collector start   # 本地内存试跑（PORT=4100）

# ---- 手机端 autotk（独立安装，不在 root workspace）----
cd apps/mobile && pnpm install
npx tsc --noEmit -p tsconfig.json    # RN App 类型检查（无测试框架，tsc 即验证）
npx expo start                       # 配置/监控面板（Expo Go 扫码）
WDA_URL=http://<手机IP>:8100 npm run wda:repl   # 电脑驱动调试台 REPL（真机操控走这里，不是 App）
```

> ⚠️ 本机 Node 版本（22.x）已**移除 `node --test <目录>` 的目录扫描**（用目录会报 `MODULE_NOT_FOUND`，与 monorepo 迁移无关）。**autotk 的 `apps/mobile/tests/run.sh` 已修**：改用 glob `node --test "$OUT/tests/"*.js` 收尾，并加 `NODE_PATH="$PWD/node_modules"`（vision 运行时测试经 detect→png 需 `require('pako')`，OUT 在树外靠 NODE_PATH 才解析得到）。**telemetry/license 里同款脚本仍是老写法**，本机要跑得照此改那一行，或用 Node ≤20。

## 注意

- autotk 的 WDA × TikTok 有一组硬约束（`snapshotMaxDepth:1`、不能靠元素树定位、只能 W3C `/actions` 点击等）——动 autotk 真机交互前**必读 `apps/mobile/CLAUDE.md`**，违反会卡死/超时。
- 真机坐标标定按机型存 `apps/mobile/adaptation/devices.json`，换机就要重标。
- secrets / 凭据（`services/signing-station/data/secrets/*` 等）已被根 `.gitignore` 排除，**勿提交**。
```
