# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`autotk` 是「小明同学 TK 自动化运营助手」的**自研复刻**——一个用 WDA(WebDriverAgent) 驱动 iPhone 上 TikTok 国际版(`com.zhiliaoapp.musically`)做养号/营销互动的自动化系统。需求方买断、只复刻功能、全自研重写、不碰原版代码。详细背景与决策见 `~/.claude` 项目记忆 `autotk-project.md`。

四大功能模块(对齐原版):推荐页互动、关键词搜索互动、个人主页互动、分时段调度。全部概率驱动,核心卖点是拟人化防风控。

## Commands

```bash
# 类型检查（无测试框架；tsc 即验证手段，改完必跑）
npx tsc --noEmit -p tsconfig.json        # RN App（src/ + App.tsx）
npx tsc -p tools/tsconfig.json           # 调试台 CLI（tools/ + 复用的 src/）

# RN App（配置/监控面板，Expo Go 真机扫码）
npx expo start                           # 然后手机 Expo Go 扫码；改完按 r 热重载

# 电脑驱动调试台（真正操控手机用这个，不是 App）
WDA_URL=http://<手机IP>:8100 npm run wda -- <命令>   # 一次性命令（每次重建会话，慢）
WDA_URL=http://<手机IP>:8100 npm run wda:repl        # 常驻 REPL（建一次会话保持热，开发首选）
```

REPL 内常用命令:`calibrate`(标定坐标) `like/save/comment/share/follow` `chearts/likecomments` `reply <文本>` `search <关键词>` `swipe` `run`(连续养号) `detect/snap`(诊断) `exit`。`help` 看全部。

## 运行拓扑(关键，否则会困惑)

- **产品最终形态**:引擎跑在手机上(贴近原版)。但普通 App 会被 iOS 挂起,**真要无人值守必须做后台保活**(Expo dev build + 永久定位/后台定位模式,原版同款 trick)——这一步尚未做。
- **开发期用电脑驱动**:控制逻辑(纯 TS)在 Linux 上跑,手机只跑 WDA + TikTok 在前台,电脑进程永不挂起,可连续跑、秒级迭代。**所有真机验证都走 `tools/` 的 CLI/REPL,不是 RN App**。手机与电脑同一 WiFi,`WDA_URL` 用手机局域网 IP。
- WDA 的操作只作用于**前台 app**——任何动作前必须 `activateApp(TIKTOK)`,否则会作用到我们自己的 App/桌面上。

## WDA × TikTok 的硬约束(踩过的坑，务必遵守)

这些是反复试错得来的,违反就会卡死/超时:

1. **`snapshotMaxDepth: 1` 是性命攸关的设置**。TikTok 视图树极大,深快照会触发 `kAXErrorIPCTimeout`(>60s 超时)。`createSession()` 后必须 `applyFastSettings()`(含 `waitForIdleTimeout:0`、`snapshotMaxDepth:1`)。后果:**读不了元素树**(找按钮/读文案都不行)——这是整个定位方案的根本约束。
2. **不能靠元素树定位 TikTok 内的按钮**。改用**截图 + 图像分析定位坐标 + 按坐标点击**。
3. **点击/滑动只能用 W3C `/actions` 端点**(`tap.ts`/`swipe.ts`)。此 WDA(14.x)已移除旧的 `/wda/tap/0` 和 `/wda/touch/perform`(`touchPerform.ts` 保留但在此设备 Unhandled,勿用)。
4. **打字用 `/wda/keys`(`typeText`)** —— 此设备可用。
5. **建空会话**:`createSession()` 不传 bundleId(不启动 App 等待,快),再 `activateApp` 切前台。
6. 客户端有 20s 请求超时(`setTimeout_`),避免卡到 fetch 默认 5 分钟。

## 架构(分层)

### `src/` —— 纯 TypeScript、可在 Node 与 RN 两端运行(不得引入 RN 专属依赖到 engine/params/wda)

- **`src/wda/`** —— WDA HTTP 客户端。`client.ts`(底层 request + 超时)、`session.ts`(会话 + `applyFastSettings`)、`operations/*`(原子操作:tap/swipe/typeText/screenshot/source/activateApp/windowSize/settings/元素查询…)。用 `fetch`(Node18+/RN 都有)。
- **`src/params/`** —— 参数 schema。`types.ts`(结构化 `AutomationParams`)、`parse.ts`(`fromLegacy` 兼容导入原版扁平 JSON + `validateParams`)、`defaults.ts`。
- **`src/engine/`** —— 概率决策引擎,**不知道 WDA 细节**,通过 `TikTokUI` 接口操作。
  - `tiktok-ui.ts` —— **关键边界接口**:决策逻辑(该不该点赞)与界面适配(按钮在哪)的分界。
  - `index.ts`(`createEngine`:分时段调度 + 按占比分发模块 + 每日一次主页 + 可打断停止)、`scheduler.ts`、`random.ts`(`chance`/`jitter`)、`modules/`(forYou/kwSearch/persHome + common)。
  - `mockUI.ts` —— `TikTokUI` 的演示实现(不连真机),供 RN App 在 Expo Go 上跑通整条链路。
  - `wdaUI.ts` —— `TikTokUI` 的元素树实现。**注意:因 snapshotMaxDepth=1 约束,此实现在真机 TikTok 上不可用**,真机走 `tools/calibratedUI.ts`。

### `src/app/` —— RN/Expo 配置与监控 UI(标签页:关键词/推荐页/搜索页/个人主页/时间/日志/调试)。用 `useEngine` 接引擎(默认 mockUI)。

### `tools/` —— 电脑驱动调试台(用 `fetch` + Node `child_process` 调 ImageMagick;**仅在 Linux 跑,不打进 App**)

- `wda-cli.ts` —— CLI/REPL 入口与命令分发。
- `railDetect.ts` —— **核心:截图图像分析定位**。截图缩到逻辑分辨率,扫右侧动作栏定位 点赞/评论/收藏/分享(白色图标带);红色检测定位关注(+)、评论爱心、发送按钮。是绕开元素树的关键。
- `deviceProfile.ts` + `adaptation/devices.json` —— **按机型标定的坐标档案**,以逻辑分辨率(如 `390x844`)为 key。`calibrate` 在干净视频上检测并存档,运行时直接读坐标点击(快、不受图标变色影响)。
- `calibratedUI.ts` —— `TikTokUI` 的标定坐标实现,`run` 命令用它驱动引擎连续养号。

## 定位方案的取舍(为什么这么绕)

动作栏图标位置**逐视频上下浮动**(±~25px,因文案长度),硬编码坐标会偏。所以:
- **稳定的(点赞/收藏/分享)**:标定一次存 JSON,运行时读坐标。
- **会变样/位置浮动的(关注红+、评论爱心、发送键)**:运行时截图检测(因为已关注则无+、评论长度不一、键盘高度变化)。
- **读取(文案/评论文本)**:元素树走不通 → 需截图 + OCR/视觉(尚未做;现用 `posPrompts:["*"]` 全互动 + mock 文案占位)。

## 当前进度与下一步

已通:推荐页连续养号(看/赞/藏/关注/划)、评论区(打开/评论点赞/发评论/关闭)、搜索(搜索→打开结果→复用互动)。
待做:① 读取(OCR/视觉)解锁精准对标 + AI 评论;② 接 Claude 生成评论文案(现 mock);③ 把搜索/评论接进引擎 kwSearch;④ 后台保活让其脱离电脑无人值守。

最新机型/坐标/拓扑/坑的细节以 `~/.claude` 项目记忆 `autotk-project.md` 为准。
