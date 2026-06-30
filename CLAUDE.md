# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 这是什么

「TK 养号 + 发布自动化」系统：用 WDA 驱动 iPhone 上的 TikTok 国际版做养号/营销互动，并配套一整套服务端（管理中心、激活授权、装机、遥测）。需求源自「小明同学 TK 自动化运营助手」的**自研复刻**——只复刻功能，全自研重写，不碰原版代码。

这**不是单个仓库**，而是同一目录下 5 个相互独立、可分别部署的子项目，外加教程/媒体资料。每个子项目有**自己的 CLAUDE.md / README**（最新事实源），本文件只给全局地图与子项目间的连线，改具体子项目时务必先读它自己的文档。

## 子项目地图

| 目录 | 角色 | 栈 | 自己的文档 |
|---|---|---|---|
| `autotk/` | **手机端核心**：WDA 驱动 TikTok 养号/评论/发布的引擎 + RN/Expo 配置监控 App + Linux 调试台 | TypeScript / React Native(Expo) / WDA HTTP | `autotk/CLAUDE.md`（必读） |
| `management-center/` | **管理中心**：云 Hub + Electron 桌面端，看几百台手机状态、批量改设置、文件夹工作流发视频 | Hub(socket.io) / Electron+React+Vite+AntD | `management-center/README.md`、`docs/dev-phase23.md` |
| `license-saas/` | **通用激活码 / 授权 SaaS**（独立、多产品复用），autotk 经 SDK 接入：启动门禁 + 心跳 | NestJS+Prisma+Postgres / React+Vite+AntD / 纯 TS SDK | `license-saas/CLAUDE.md`（必读） |
| `signing-station/` | **装机台**：手机扫码即装 WDA/autotk（OTA 自助分发 + 自动 UDID 注册 + ad-hoc 重签），不碰电脑 | Fastify + Caddy + zsign + ASC API | `signing-station/README.md`、`docs/plan.md` |
| `telemetry/` | **自建轻量第一方埋点**：给上面三套系统统一遥测（匿名、无 PII、国内可访问） | 纯 TS SDK + collector(Postgres) | `telemetry/README.md` |

媒体/资料（非代码，勿改）：`*.mp4`、`*.PNG`、`*.docx`、`参数辅助生成工具.exe`、`额外参数软件讲解/`。
`真机与上线收尾清单.md` 是全局验收清单——列出所有**仅靠真机/Mac 构建/部署才能验**的事项，问到「还差什么才能上线」先看它。

## 子项目之间怎么连（关键全局认知）

- **autotk ↔ management-center**：手机端 `autotk/src/hub/`（HubClient/reporter/configInbox）连云 Hub，上报状态/日志、收批量配置、收发布任务。两边共用的协议/参数类型分别在各自仓库（`autotk/src/hub/protocol.ts`、`management-center/packages/shared`），**不是同一份代码，改协议要两边同步**。手机用 `EXPO_PUBLIC_HUB_URL` 指向 Hub。
- **autotk ↔ license-saas**：手机端 `autotk/src/license/` 通过 vendored 的 license SDK 做激活门禁 + 心跳。**license SDK 改动后需手动同步 vendored 副本到 `autotk/src/license/sdk/`**（两仓库解耦，只靠 SDK 交互）。上线前要在 license 后台建 `autotk` 产品，把 key/secret 填进 autotk config/.env。
- **signing-station** 产出/分发的是 autotk 与 WDA 的 IPA 母包（`apps/wda.ipa` 云编译、`apps/autotk.ipa` 由 Mac `expo prebuild`）。它不依赖其它子项目运行，但服务于 autotk 的真机落地。
- **telemetry** 是横切：三端各自 vendored/接入 `@telemetry/sdk`（目前三端接入尚未完成）。
- **账号体系**：management-center 的 Hub 与 license-saas **各自独立、不共用、不同步**（早期曾设想同一套，已废弃）。

## 改需求前的定位心法

1. 需求是**手机上的自动化行为**（养号/评论/发布/弹窗脱困/坐标适配）→ `autotk/`，且区分纯逻辑（`autotk/src/engine|params|wda`，可 Node 测）vs RN 接线（`autotk/src/app`、原生模块，需 Mac/真机）。
2. 需求是**批量管理几百台手机 / 桌面操作 / 文件夹发视频** → `management-center/`（Hub 改路由协议、desktop 改 UI、shared 改类型）。
3. 需求是**激活码 / 授权 / 分销 / 用量看板** → `license-saas/`（业务规则改 `core`/`domain` 带单测，接线改 `adapters`/控制器）。
4. 需求是**怎么把 App 装到手机上 / 证书签名 / UDID** → `signing-station/`。
5. 需求是**埋点 / 数据上报** → `telemetry/`，但接入点在各业务子项目里。

## 跨项目通用约定

- **改一处必须保证关联处仍能跑（强约束）**：这几个子项目通过协议/SDK/IPA 母包/埋点互相咬合，**不允许改了一边导致另一边跑不起来**。动到下列任一处时，必须同步检查并改动配对处：
  - autotk `src/hub/protocol.ts` ↔ `management-center/packages/shared` + Hub 路由（消息格式两边各一份）。
  - license SDK ↔ vendored 副本 `autotk/src/license/sdk/`（改完手动同步）。
  - autotk 的参数/产物形态 ↔ signing-station 的母包入口、telemetry 事件 ↔ 各接入端。
  改完要把**两边的测试都跑一遍**确认仍绿，并在回复里说明波及到了哪些子项目。
- **架构基调到处是「端口-适配器」**：纯业务逻辑放不依赖框架的 `core`/`domain`（用假实现单测），框架/外部脏活（Prisma、HTTP、zsign、socket.io、ImageMagick）放 `adapters`。**改规则改核心层并补测，改接线改适配器。**
- **测试纪律**：纯逻辑都有自动化测试，回归靠各项目 `npm test` / `bash tests/run.sh`；真机/Electron/Postgres 相关的接线层只能在对应运行时验（见 `真机与上线收尾清单.md`）。改完跑对应测试保持绿。
- 本机 npm 带审批拦截安装脚本：装新依赖若提示，跑 `npm approve-scripts <pkg>`（esbuild/prisma/electron 等）。

## 各子项目最常用命令（详见各自文档）

```bash
# autotk（pnpm 工作区；无测试框架，tsc 即验证）
cd autotk
npx tsc --noEmit -p tsconfig.json        # RN App 类型检查（改完必跑）
npx tsc -p tools/tsconfig.json           # 调试台 CLI 类型检查
npm test                                 # bash tests/run.sh（纯逻辑 node:test）
npx expo start                           # RN 配置/监控面板（Expo Go 扫码）
WDA_URL=http://<手机IP>:8100 npm run wda:repl   # 电脑驱动调试台 REPL（真机操控走这里，不是 App）

# management-center（npm workspaces，根目录一次装全）
cd management-center && npm install
cd services/hub && npm start             # Hub :4000；npm run mock -- d1 手机1 模拟设备
cd apps/desktop && npm run dev:renderer  # vite :5173；再 VITE_DEV_SERVER_URL=... npm run electron

# license-saas（pnpm monorepo；本机有 docker postgres license-pg:55432）
cd license-saas && docker compose up -d --build   # db + api :3001
cd services/license && npm run test:unit          # 领域逻辑（无依赖）；npm test 打真库；npm run test:e2e 全栈
cd apps/web && npm run dev                         # 管理后台 :5173

# signing-station（vitest）
cd signing-station && npm test && npm run dev      # dev = tsx watch src/main.ts

# telemetry
cd telemetry/collector && PORT=4100 npx tsx src/main.ts   # 本地内存试跑；bash tests/run.sh 测
```

## 注意

- 整个目录目前**不是 git 仓库**，5 个子项目是平级目录、各自 workspace。
- **方向：要迁成单一 monorepo**（按 `autotk/docs/PLAN-OVERVIEW.md` 的 `apps/* services/* packages/*` 布局，pnpm workspace）。尚未执行——属于一次独立的结构性改造，开工前需单独拍方案。在迁移完成前，新代码仍按现有平级目录归位。
- autotk 的 WDA × TikTok 有一组硬约束（`snapshotMaxDepth:1`、不能靠元素树定位、只能 W3C `/actions` 点击等）——动 autotk 真机交互前**必读 `autotk/CLAUDE.md`**，违反会卡死/超时。
- 真机坐标标定按机型存 `autotk/adaptation/devices.json`，换机就要重标。
