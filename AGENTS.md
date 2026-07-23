# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## 这是什么

「TK 养号 + 发布自动化」系统：用 WDA 驱动 iPhone 上的 TikTok 国际版做养号/营销互动，并配套一整套服务端（管理中心、激活授权、装机、遥测）。需求源自「小明同学 TK 自动化运营助手」的**自研复刻**——只复刻功能，全自研重写，不碰原版代码。

**⚠️ 2026-07 起项目处于「autotk 2.0 重构」中**（见下方专节）：手机端引擎已推倒重来，重构为「内网 GPU 主机集中识别（LocateAnything-3B VLM）+ 手机哑执行器」的 core+plugin 框架。新代码在 `packages/automation-core|driver-ios-wda|perceptor-vlm|plugin-tiktok` + `services/master|perception`；旧 `apps/mobile` **已拍板彻底退役**（2026-07-20，纯 OCR/像素方案太脆弱）——不再投入任何开发/维护，仅作知识库。**当前进度与下一步的权威快照：`docs/项目进度报告.md`；全部待定决策已拍板：`docs/决策记录-2026-07-20.md`。**

**这是一个 pnpm monorepo**（2026-07 由原本 5 个平级目录迁入），布局 `apps/* services/* packages/*`。各子项目仍是相互独立、可分别部署的单元，且大多有**自己的 AGENTS.md / README**（最新事实源）——本文件只给全局地图与子项目间的连线，改具体子项目前先读它自己的文档。

## 仓库布局与子项目地图

```
apps/
  mobile/              旧手机端 autotk（RN/Expo，**已退役 2026-07-20**，仅知识库）——见下方「⚠️ 未进 workspace」
  receiver/  @autotk/receiver  【2.0】收视频端：极小 iOS App，连 master→下载视频存相册（排除出 root workspace；自带独立 workspace/lock，Mac 构建）
  desktop/   @mc/desktop      管理中心 Electron 桌面端
  web/       @license/web     license 管理后台（React+Vite+AntD）
services/
  hub/       @mc/hub          管理中心云 Hub（socket.io）
  publisher/ @mc/publisher    桌面端发布能力（文件夹工作流 + LAN 直传）
  license/   @license/api     激活授权后端（NestJS+Prisma+Postgres）
  signing-station/            装机台（Fastify + zsign + ASC API；OTA 自助分发）
  telemetry-collector/  @telemetry/collector   埋点采集（Postgres）
  update-server/ @autotk/update-server  自建 expo-updates OTA 热更服务（给旧 apps/mobile 推 JS 热修）
  master/    @mc/master       【2.0】驱动电脑/桌面端内嵌主控：发现设备、装配 Fleet、运行工作流
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
| `packages/automation-core` + `driver-ios-wda` + `perceptor-vlm` + `plugin-tiktok` + `services/master` + `services/perception` + `apps/receiver` | **【2.0 主线】新自动化框架**：core+plugin+依赖倒置，VLM 集中识别 | `docs/项目进度报告.md`（进度快照）、`docs/自动化框架-架构设计总纲.md`（权威总纲）、`docs/真机部署手册.md`（**命令级部署**）、`docs/真机联调-checklist.md`、`docs/specs/*` |
| `apps/mobile` | **旧手机端（已退役 2026-07-20）**：仅作知识库，不再改动；WDA×TikTok 教训已提炼进 `docs/specs/` | `apps/mobile/AGENTS.md`（考古时读） |
| `services/update-server` | **OTA 热更**：expo-updates 协议 v1 自建服务器（原服务旧 apps/mobile；旧端退役后暂无服务对象，去留待定） | `services/update-server/README.md` |
| `services/hub` + `services/publisher` + `apps/desktop` + `packages/shared` | **管理中心**：Electron 内嵌 Hub/master，看设备、批量配置、文件夹发视频 | `docs/management-center/README.md` |
| `services/license` + `packages/license-sdk` + `apps/web` | **通用激活码 / 授权 SaaS**（独立、多产品复用） | `services/license/AGENTS.md`（必读） |
| `services/signing-station` | **装机台**：扫码安装/重签 WDA；旧 autotk 母包不再部署 | `services/signing-station/README.md` |
| `services/telemetry-collector` + `packages/telemetry-sdk` | **自建第一方埋点**（匿名、无 PII） | `services/telemetry-collector/README.md` |

媒体/资料（非代码，勿改，已 gitignore）：根目录 `*.mp4`、`*.PNG`、`*.docx`、`参数辅助生成工具.exe`、`额外参数软件讲解/`。
部署、冒烟、单工作流测试、问题留证统一看 `docs/真机部署手册.md`；逐轮测试记录与反馈模板统一看 `docs/真机联调-checklist.md`。不要再新建平行部署清单。

## autotk 2.0 重构（当前主线，2026-07 起）

需求方 2026-07-10 定案：**推倒重来、不复用旧代码**（旧代码仅作知识库，教训已提炼进 `docs/specs/`）。核心转向：手机只跑 WDA（哑执行器，**零决策代码**），识别/决策集中在内网 GPU 主机；**LocateAnything-3B（VLM）是坐标/决策唯一来源**——一句英文指令定位任意目标（弹窗 ×/Don't Allow/点赞键…），消灭逐机标定，天然应对 TikTok 随时弹出的多样化广告/权限弹窗。功能重划为 5 个：搜索互动 / 主页互动+私信 / 关注监控打粉 / 发布 / 评论区下滑（砍掉推荐页养号，新增私信）。

> **唯一例外——发布投递（D9）**：养号/搜索/评论/私信/打粉 + 发布的 UI 操作全走 WDA+VLM，手机无需任何 App。但发布要求视频**先在相册里**，而 iOS 不允许非 App 写相册（WDA 只能点 UI，不能注入文件）。故每台需装一个**极小「收视频 App」**（哑文件槽：下载+存相册，非引擎，不违背 D8）。详见 `docs/决策记录-2026-07-20.md` D9；收视频 App 是 Mac-build 任务。

**架构**：core+plugin+依赖倒置。`@auto/core` 定义 `Driver`/`Perceptor`/`Plugin`/`StateStore` 接口 + Step 合同决策引擎（观测→危险优先→执行→验证轮询）+ Fleet 编排，**不 import 任何插件**；TikTok 的一切在 `@auto/plugin-tiktok`（Target 注册表是声明式感知的单一数据源）。四层：L3 工作流(plugin) → L2 动作(plugin) → L1 基本操作(core: tapTarget/awaitTarget/handleHazards) → L0 原子(WDA 1:1)。onFail 升级链最后一级永远是「停手+告警」，绝不盲动。

**实测硬事实**（改性能相关代码前必知，详见 `docs/LocateAnything-3B-5060Ti-性能报告.md`）：
- 模型是**单目标 grounding**（2026-07-21 真机证实）：一次组合查询即使格式服从**也只返回第一个目标**（架构使然：PBD 框头 + 自定义 hybrid generate，原生即单指代表达）。故 `perceptor-vlm` 的 `locate()` 与引擎均**逐个单查**——组合协议 `buildLocateInstruction`/P1 退化已删。**别再引入组合多目标查询**。
- **危险检测=一次 OCR 读屏（2026-07-21，为多机吞吐）**：不逐个 grounding 查危险（那样 N 危险×(定位+OCR复核)≈ 每轮十几次 VLM，几百台跑不动）。引擎 `detectHazard` 每轮**读一次屏上文字**，用各危险的 `ocr` 特征在全屏文本里匹配——命中即在场（靠真实文字，天然过滤 grounding 幻觉），只对命中的那个再定位关闭键（点按类）。干净页=1 次 OCR，有弹窗=1 OCR+1 定位。**危险优先仍是公理**。要求:凡进「页级危险」(`activation.pageHazards`/`globalHazards`)的都必须带 `ocr` 特征；**内容类标记(直播/广告 `feed.live-tag`/`feed.ad-marker`/`comment.ad-first`)不进页级危险**（全屏 OCR 下会被字幕误伤），由工作流 `ctx.locate` 显式判。无 `ocr` 的危险退回逐个 grounding 检测(兜底)。
- 模型**只支持 batch=1**（批处理假设已被推翻）；单流 ~2.1 张/s@768（RTX 5060 Ti）。
- **生产分辨率 640（2026-07-20 拍板，不再专门 bench）**——精度实测仅覆盖 768（十张全准）与 512（丢 ~15px 小 ×）；640 由真机逐目标验收顺带实测，小目标不稳即回 768（perception `--max-side` 一个参数）。
- FP8 / flash-attn 在当前 Blackwell(sm_120) 软件栈均不通（生态未跟上）；生产 GPU 机 OS **已拍板锁 Ubuntu 24.04**。
- 承载量：「VLM 唯一指令源」单卡 ~10 台（裸）；几百台=多卡分片。

**进度**（快照 2026-07-23，详见 `docs/项目进度报告.md`）：core/plugin、WDA driver、VLM perceptor、多机 master、Hub 平铺接入、发布编排、自动发现、Electron 内嵌 master 与实时状态均已接线；现在可用 `workflow:test` 指定一台手机和一个工作流，只跑一次并自动保存截图、事件、日志与摘要。**下一步仍是真机闭环验证**：冒烟 → 逐目标 640 精度 → 单工作流 → 多机常驻 → 发布。未完成的生产项主要是 Postgres StateStore、receiver 多机运行时身份/配置，以及真实环境验收。

**决策已全部拍板（2026-07-20，单一真源 `docs/决策记录-2026-07-20.md`）**：D1 纯 VLM 指令源（单卡约 10 台规划，优化后置）/ D2 DHCP 静态租约 + 可选自动发现 / D3 Hub 平铺 / D4 MVP 不接 License / D5 Ubuntu 24.04 / D6 640 / D7 吞吐优化搁置 / D8 apps/mobile 退役 / D9 发布额外安装 receiver。LocateAnything 已由真机确认是单目标模型，必须逐目标查询，禁止恢复组合查询。

## ⚠️ apps/mobile 已退役并排除出 root workspace（仅考古）

> **2026-07-20 拍板 apps/mobile 彻底退役**（决策记录 D8）——「phase 4 收编」计划作废，涉及 mobile 的 vendored 同步纪律全部冻结；本节与 `apps/mobile/AGENTS.md` 仅考古旧代码时参考。

`apps/mobile`（旧 RN/Expo autotk）被 `pnpm-workspace.yaml` 显式排除，只保留独立 lock/workspace 供考古。正常开发、部署、测试都不要安装或修改它；除非需求方重新作出架构决策，否则不得恢复旧端或所谓 phase 4 收编。

## 子项目之间怎么连（关键全局认知）

- **desktop ↔ master ↔ Hub**：Electron 启动内嵌 Hub 和 master；master 为每台真机注册平铺设备身份，上报状态、工作流/WDA 日志，接收配置、启停和发布任务。纯命令行部署也可用环境变量连接独立 Hub。
- **master ↔ receiver**：master 侧协议真源在 `services/master/src/receiver/protocol.ts`，receiver 端有 vendored 副本。receiver 只负责把视频写入相册，UI 发布仍由 WDA+VLM 完成。
- **signing-station ↔ WDA**：生产装机台重签并分发含 XCTest 的 WDA 母包；receiver 目前仍是 Mac/Expo 构建任务，尚未形成多机统一分发闭环。
- **telemetry**：活跃副本只维护 desktop 与 license；apps/mobile 副本冻结，Hub 尚未接入遥测。
- **账号体系**：管理中心 Hub 与 license 各自独立、不共用、不同步。

## 跨项目通用约定

- **改一处必须保证关联处仍能跑（强约束）**：这些包通过协议/SDK/IPA 母包/埋点互相咬合，**不允许改了一边导致另一边跑不起来**。改「源」必同步「副本/消费方」（下表状态已用代码核实）：

  | 耦合缝 | 源 | 副本/消费方 | 状态 | 改动纪律 |
  |---|---|---|---|---|
  | Hub 协议 | `packages/shared/src/protocol.ts` | `services/hub`、`services/master`、`apps/desktop` | workspace 单源依赖 | 改协议要同步三个消费方并跑各自测试/typecheck |
  | telemetry SDK | `packages/telemetry-sdk/src/` | `apps/desktop/src/telemetry/sdk/`、`services/license/src/telemetry/sdk/` | 活跃 vendored 副本 | 改后同步 desktop/license 两份；apps/mobile 不再同步 |
  | WDA IPA 母包 | WDA Mac/云构建产物 | `services/signing-station/apps/*.ipa` | 二进制，gitignore | 必须保留 XCTest；跑 `pnpm --filter signing-station check` |
  | 【2.0】Target 注册表 | `packages/plugin-tiktok/src/target-registry.json`（运行时真源） | `docs/specs/target-registry.json`（规格档） | 逐字节同步 | 改注册表两处同步；注意 `region` 是 `[x,y,w,h]`、代码 `Box` 是角点——加载时换算（d0b0330 修过的高危坑）；跑 `pnpm --filter @auto/plugin-tiktok test` |
  | 【2.0】收视频端协议 | `services/master/src/receiver/protocol.ts`（master 侧真源） | `apps/receiver/src/protocol.ts`（vendored，独立 workspace） | 同语义 | 改 download/hello/progress 消息两处同步；跑 master 测试，再跑 `pnpm --dir apps/receiver test` |

- **架构基调到处是「端口-适配器」**：纯业务逻辑放不依赖框架的 `core`/`domain`（用假实现单测），框架/外部脏活（Prisma、HTTP、zsign、socket.io、ImageMagick）放 `adapters`。**改规则改核心层并补测，改接线改适配器。**
- **测试纪律**：纯逻辑必须有自动化测试；真机/GPU/Electron 打包/Postgres 接线只能在对应运行时验。按 `docs/真机部署手册.md` 分层执行，并把结果填入 `docs/真机联调-checklist.md`，不得把离线绿误报为真机已验。
- 装新依赖若 pnpm 提示 build script 被拦截，跑 `pnpm approve-builds`（esbuild/electron/prisma 等；常用的已列在 `pnpm-workspace.yaml` 的 `onlyBuiltDependencies`）。

## 常用命令

```bash
# ---- root（pnpm monorepo，不含 apps/mobile）----
pnpm install                         # 装全部 workspace 成员
pnpm -r --if-present test            # 递归跑各包测试（注意：license vitest 集成需 Postgres）
pnpm --filter @mc/hub test           # 跑单个包

# ---- autotk 2.0 新框架 ----
pnpm --filter "@auto/*" test         # 离线，mock 驱动/感知，无需真机/GPU
pnpm --filter "@auto/*" typecheck
pnpm --filter @mc/master test
pnpm --filter @mc/master typecheck
# 多机运行时（GPU 机上，配置表见 services/master/devices.example.json）：
#   MASTER_CONFIG=./devices.json pnpm --filter @mc/master start
# GPU 感知服务（GPU 机上；生产基线 640/0.7）：
#   pip install -r services/perception/requirements.txt
#   python services/perception/server.py --model ./LocateAnything-3B --attn sdpa --max-side 640 --port 8000
# 真机单机冒烟（驱动电脑）：
#   WDA_URL=http://<手机IP>:8100 VLM_URL=http://<GPU机IP>:8000 pnpm --filter @mc/master smoke   # 加 TAP=1 真点
# 真机单工作流（只跑一次并写 test-artifacts）：
#   pnpm --filter @mc/master workflow:test -- --config ./devices.json --device <id> --workflow search

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

- autotk 的 WDA × TikTok 有一组硬约束（`snapshotMaxDepth:1`、不能靠元素树定位、只能 W3C `/actions` 点击等）——动真机交互前必读：旧端看 `apps/mobile/AGENTS.md`，2.0 看 `docs/specs/L0-WDA-规格书.md` + `docs/specs/坑清单.md`，违反会卡死/超时。系统弹窗**不走 WDA `/alert`**（带地图的定位权限窗读不到），统一「截图→VLM 定位→tap」。
- （旧端遗留，已随退役失效）真机坐标标定按机型存 `apps/mobile/adaptation/devices.json`——2.0 无标定，VLM 直接出坐标。
- secrets / 凭据（`services/signing-station/data/secrets/*` 等）已被根 `.gitignore` 排除，**勿提交**。
