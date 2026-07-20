# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 这是什么

「TK 养号 + 发布自动化」系统：用 WDA 驱动 iPhone 上的 TikTok 国际版做养号/营销互动，并配套一整套服务端（管理中心、激活授权、装机、遥测）。需求源自「小明同学 TK 自动化运营助手」的**自研复刻**——只复刻功能，全自研重写，不碰原版代码。

**⚠️ 2026-07 起项目处于「autotk 2.0 重构」中**（见下方专节）：手机端引擎已推倒重来，重构为「内网 GPU 主机集中识别（LocateAnything-3B VLM）+ 手机哑执行器」的 core+plugin 框架。新代码在 `packages/automation-core|driver-ios-wda|perceptor-vlm|plugin-tiktok` + `services/master|perception`；旧 `apps/mobile` **已拍板彻底退役**（2026-07-20，纯 OCR/像素方案太脆弱）——不再投入任何开发/维护，仅作知识库。**当前进度与下一步的权威快照：`docs/项目进度报告.md`；全部待定决策已拍板：`docs/决策记录-2026-07-20.md`。**

**这是一个 pnpm monorepo**（2026-07 由原本 5 个平级目录迁入），布局 `apps/* services/* packages/*`。各子项目仍是相互独立、可分别部署的单元，且大多有**自己的 CLAUDE.md / README**（最新事实源）——本文件只给全局地图与子项目间的连线，改具体子项目前先读它自己的文档。

## 仓库布局与子项目地图

```
apps/
  mobile/              旧手机端 autotk（RN/Expo，**已退役 2026-07-20**，仅知识库）——见下方「⚠️ 未进 workspace」
  desktop/   @mc/desktop      管理中心 Electron 桌面端
  web/       @license/web     license 管理后台（React+Vite+AntD）
services/
  hub/       @mc/hub          管理中心云 Hub（socket.io）
  publisher/ @mc/publisher    桌面端发布能力（文件夹工作流 + LAN 直传）
  license/   @license/api     激活授权后端（NestJS+Prisma+Postgres）
  signing-station/            装机台（Fastify + zsign + ASC API；OTA 自助分发）
  telemetry-collector/  @telemetry/collector   埋点采集（Postgres）
  update-server/ @autotk/update-server  自建 expo-updates OTA 热更服务（给旧 apps/mobile 推 JS 热修）
  master/    @mc/master       【2.0】GPU 主机上的主控：运行时装配 + 单机冒烟工具（多机装配待做）
  perception/                 【2.0】GPU 感知服务（Python/FastAPI 包 LocateAnything-3B，OpenAI 兼容端点）
packages/
  shared/        @mc/shared       管理中心协议 + AutomationParams（hub/desktop 共用）
  license-sdk/   @license/sdk     激活 SDK（纯 TS，给 autotk/未来产品）
  telemetry-sdk/ @telemetry/sdk   埋点客户端 SDK（RN/Node/浏览器共用）
  automation-core/ @auto/core     【2.0】框架核心：Driver/Perceptor 接口 + Step 决策引擎 + Fleet 编排（与 app 无关）
  driver-ios-wda/  @auto/driver-ios-wda  【2.0】Driver 的 WDA 实现
  perceptor-vlm/   @auto/perceptor-vlm   【2.0】Perceptor 实现（OpenAI 兼容 VLM 客户端，grounding/OCR）
  plugin-tiktok/   @auto/plugin-tiktok   【2.0】TikTok 插件：Target 注册表 + 5 工作流 + 参数
bench/locateanything/             LocateAnything-3B 实测脚本 + 10 张真机样本（选型/承载量依据）
docs/management-center/           管理中心 README + dev/req 文档
docs/specs/                       【2.0】G0 规格：L0-WDA 规格书 / 协议规格 / L3 业务规格 / 坑清单 / target-registry
```

各子项目角色一句话 + 必读文档：

| 包 | 角色 | 必读文档 |
|---|---|---|
| `packages/automation-core` + `driver-ios-wda` + `perceptor-vlm` + `plugin-tiktok` + `services/master` + `services/perception` | **【2.0 主线】新自动化框架**：core+plugin+依赖倒置，VLM 集中识别 | `docs/项目进度报告.md`（进度权威快照）、`docs/自动化框架-架构设计总纲.md`（权威总纲）、`docs/specs/*` |
| `apps/mobile` | **旧手机端（已退役 2026-07-20）**：仅作知识库，不再改动；WDA×TikTok 教训已提炼进 `docs/specs/` | `apps/mobile/CLAUDE.md`（考古时读） |
| `services/update-server` | **OTA 热更**：expo-updates 协议 v1 自建服务器（原服务旧 apps/mobile；旧端退役后暂无服务对象，去留待定） | `services/update-server/README.md` |
| `services/hub` + `services/publisher` + `apps/desktop` + `packages/shared` | **管理中心**：云 Hub + Electron，看几百台手机、批量改设置、文件夹发视频 | `docs/management-center/README.md`、`docs/management-center/dev-phase23.md` |
| `services/license` + `packages/license-sdk` + `apps/web` | **通用激活码 / 授权 SaaS**（独立、多产品复用） | `services/license/CLAUDE.md`（必读） |
| `services/signing-station` | **装机台**：扫码即装 WDA/autotk（UDID 自动注册 + ad-hoc 重签） | `services/signing-station/README.md`、`docs/plan.md` |
| `services/telemetry-collector` + `packages/telemetry-sdk` | **自建第一方埋点**（匿名、无 PII） | `services/telemetry-collector/README.md` |

媒体/资料（非代码，勿改，已 gitignore）：根目录 `*.mp4`、`*.PNG`、`*.docx`、`参数辅助生成工具.exe`、`额外参数软件讲解/`。
`真机与上线收尾清单.md` 是全局验收清单——列出所有**仅靠真机/Mac 构建/部署才能验**的事项，问到「还差什么才能上线」先看它（其中路径仍是迁移前写法，自行换算到新布局）。

## autotk 2.0 重构（当前主线，2026-07 起）

需求方 2026-07-10 定案：**推倒重来、不复用旧代码**（旧代码仅作知识库，教训已提炼进 `docs/specs/`）。核心转向：手机只跑 WDA（哑执行器，零我方代码），识别/决策集中在内网 GPU 主机；**LocateAnything-3B（VLM）是坐标/决策唯一来源**——一句英文指令定位任意目标（弹窗 ×/Don't Allow/点赞键…），消灭逐机标定，天然应对 TikTok 随时弹出的多样化广告/权限弹窗。功能重划为 5 个：搜索互动 / 主页互动+私信 / 关注监控打粉 / 发布 / 评论区下滑（砍掉推荐页养号，新增私信）。

**架构**：core+plugin+依赖倒置。`@auto/core` 定义 `Driver`/`Perceptor`/`Plugin`/`StateStore` 接口 + Step 合同决策引擎（观测→危险优先→执行→验证轮询）+ Fleet 编排，**不 import 任何插件**；TikTok 的一切在 `@auto/plugin-tiktok`（Target 注册表是声明式感知的单一数据源）。四层：L3 工作流(plugin) → L2 动作(plugin) → L1 基本操作(core: tapTarget/awaitTarget/handleHazards) → L0 原子(WDA 1:1)。onFail 升级链最后一级永远是「停手+告警」，绝不盲动。

**实测硬事实**（改性能相关代码前必知，详见 `docs/LocateAnything-3B-5060Ti-性能报告.md`）：
- 模型**只支持 batch=1**（批处理假设已被推翻）；单流 ~2.1 张/s@768（RTX 5060 Ti）。
- **生产分辨率 640（2026-07-20 拍板，不再专门 bench）**——精度实测仅覆盖 768（十张全准）与 512（丢 ~15px 小 ×）；640 由真机逐目标验收顺带实测，小目标不稳即回 768（perception `--max-side` 一个参数）。
- FP8 / flash-attn 在当前 Blackwell(sm_120) 软件栈均不通（生态未跟上）；生产 GPU 机 OS **已拍板锁 Ubuntu 24.04**。
- 承载量：「VLM 唯一指令源」单卡 ~10 台（裸）；几百台=多卡分片。

**进度**（快照 2026-07-10，详见 `docs/项目进度报告.md`）：G0 规格～G5 编排全部完成，169 单测全绿（mock 驱动/感知，离线确定性）；`services/perception` + 单机冒烟工具已写完。**下一步 = 真机联调**（顺序：冒烟 → 逐目标精度 → 组合多目标指令（perceptor-vlm 的 `protocol.ts`）→ 私信可行性 → 单工作流 search → 多机 Fleet），以及 `services/master` 多机装配、Postgres StateStore、Hub 对接。

**决策已全部拍板（2026-07-20，单一真源 `docs/决策记录-2026-07-20.md`）**：D1 纯 VLM 指令源（单卡 ~10 台规划，优化后置）/ D2 手机 IP=DHCP 静态租约+master 配置表 / D3 Hub=A 平铺 / D4 MVP 不接 License / D5 生产 OS=Ubuntu 24.04 / D6 生产分辨率 640 / D7 吞吐优化搁置 / D8 apps/mobile 彻底退役；私信必做+失败记录。落地任务 T1–T4/T6 已完成（perception 640+temperature 可配、P1 组合退化、私信失败留痕），**仅剩 T5 = `services/master` 多机装配**。

## ⚠️ apps/mobile 暂未进 root workspace（已退役，仅考古）

> **2026-07-20 拍板 apps/mobile 彻底退役**（决策记录 D8）——「phase 4 收编」计划作废，涉及 mobile 的 vendored 同步纪律全部冻结；本节与 `apps/mobile/CLAUDE.md` 仅考古旧代码时参考。

`apps/mobile`（autotk，RN/Expo）目前被 **`pnpm-workspace.yaml` 用 `!apps/mobile` 显式排除**，保留**自带的独立安装**（`apps/mobile/pnpm-workspace.yaml` + 自己的 lock/node_modules）。原因：RN 的 Metro 打包 + 原生模块 autolink 进 monorepo 需要专门配置且**只能真机/Mac 验**，属延后的「phase 4」。

- 装 / 跑 autotk：`cd apps/mobile && pnpm install`，再按 `apps/mobile/CLAUDE.md`。
- root 的 `pnpm install` / `pnpm -r` **不含** apps/mobile。
- 等做 phase 4（加 Expo monorepo 的 `metro.config.js` 并真机验）后，去掉那条排除即可纳入；同时可顺势消灭下面两处 vendored 副本。

## 子项目之间怎么连（关键全局认知）

> **注（2026-07-20）**：apps/mobile 已退役——下面 mobile↔* 的连线及其同步义务随之冻结（不再改 mobile 就无需同步），保留仅作存档；telemetry 的 mobile 副本同理不再维护。

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
  | 【2.0】Target 注册表 | `packages/plugin-tiktok/src/target-registry.json`（运行时真源） | `docs/specs/target-registry.json`（规格档） | 逐字节同步 | 改注册表两处同步；注意 `region` 是 `[x,y,w,h]`、代码 `Box` 是角点——加载时换算（d0b0330 修过的高危坑）；跑 `pnpm --filter @auto/plugin-tiktok test` |

  **2026-07-20 起**：apps/mobile 已退役——表中 mobile 相关行（Hub 协议子集 / license SDK 副本 / telemetry mobile 副本 / Hub 端口表 / DeviceProfile）**冻结，不再需要同步**；telemetry 只剩 desktop/license 两份副本要同步。仍生效的缝：telemetry（desktop/license）、IPA 母包（WDA）、【2.0】Target 注册表。改完把**两边的测试都跑一遍**确认仍绿，并在回复里说明波及到了哪些包。
- **架构基调到处是「端口-适配器」**：纯业务逻辑放不依赖框架的 `core`/`domain`（用假实现单测），框架/外部脏活（Prisma、HTTP、zsign、socket.io、ImageMagick）放 `adapters`。**改规则改核心层并补测，改接线改适配器。**
- **测试纪律**：纯逻辑都有自动化测试，回归靠各包测试；真机/Electron/Postgres 相关的接线层只能在对应运行时验（见 `真机与上线收尾清单.md`）。改完跑对应测试保持绿。
- 装新依赖若 pnpm 提示 build script 被拦截，跑 `pnpm approve-builds`（esbuild/electron/prisma 等；常用的已列在 `pnpm-workspace.yaml` 的 `onlyBuiltDependencies`）。

## 常用命令

```bash
# ---- root（pnpm monorepo，不含 apps/mobile）----
pnpm install                         # 装全部 workspace 成员
pnpm -r --if-present test            # 递归跑各包测试（注意：license vitest 集成需 Postgres）
pnpm --filter @mc/hub test           # 跑单个包

# ---- autotk 2.0 新框架 ----
pnpm --filter "@auto/*" test         # 174 单测（离线，mock 驱动/感知，无需真机/GPU）
pnpm --filter "@auto/*" typecheck
# GPU 感知服务（GPU 机上，bench 的 venv 内；640/0.8 为拍板默认值）：
#   pip install -r services/perception/requirements.txt
#   python services/perception/server.py --model ./LocateAnything-3B --attn sdpa --max-side 640 --port 8000
# 真机单机冒烟（驱动电脑）：
#   WDA_URL=http://<手机IP>:8100 VLM_URL=http://<GPU机IP>:8000 pnpm --filter @mc/master smoke   # 加 TAP=1 真点

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

# ---- 旧手机端 autotk（已退役 2026-07-20，仅考古；独立安装，不在 root workspace）----
cd apps/mobile && pnpm install
npx tsc --noEmit -p tsconfig.json    # RN App 类型检查（无测试框架，tsc 即验证）
npx expo start                       # 配置/监控面板（Expo Go 扫码）
WDA_URL=http://<手机IP>:8100 npm run wda:repl   # 电脑驱动调试台 REPL（真机操控走这里，不是 App）
```

> ⚠️ 本机 Node 版本（22.x）已**移除 `node --test <目录>` 的目录扫描**（用目录会报 `MODULE_NOT_FOUND`，与 monorepo 迁移无关）。**autotk 的 `apps/mobile/tests/run.sh` 已修**：改用 glob `node --test "$OUT/tests/"*.js` 收尾，并加 `NODE_PATH="$PWD/node_modules"`（vision 运行时测试经 detect→png 需 `require('pako')`，OUT 在树外靠 NODE_PATH 才解析得到）。**telemetry/license 里同款脚本仍是老写法**，本机要跑得照此改那一行，或用 Node ≤20。

## 注意

- autotk 的 WDA × TikTok 有一组硬约束（`snapshotMaxDepth:1`、不能靠元素树定位、只能 W3C `/actions` 点击等）——动真机交互前必读：旧端看 `apps/mobile/CLAUDE.md`，2.0 看 `docs/specs/L0-WDA-规格书.md` + `docs/specs/坑清单.md`，违反会卡死/超时。系统弹窗**不走 WDA `/alert`**（带地图的定位权限窗读不到），统一「截图→VLM 定位→tap」。
- （旧端遗留，已随退役失效）真机坐标标定按机型存 `apps/mobile/adaptation/devices.json`——2.0 无标定，VLM 直接出坐标。
- secrets / 凭据（`services/signing-station/data/secrets/*` 等）已被根 `.gitignore` 排除，**勿提交**。
