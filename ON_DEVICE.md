# 搬上 iOS App + 后台保活

把"电脑驱动"的自动化搬到手机上自驱动、无人值守。需离开 Expo Go，做一个**自定义 dev build**（带原生模块 + 后台模式 + 本地 HTTP 例外）。

## 为什么不能用 Expo Go
- 后台保活需要后台定位模式（原生能力）；
- OCR 用 Apple Vision（原生模块）；
- WDA 走 `http://localhost:8100`，iOS ATS 默认禁明文 HTTP，需 Info.plist 例外。
以上都需要自定义原生构建，Expo Go 提供不了。

## 架构：哪些复用、哪些换
| 层 | 电脑驱动（tools/） | 手机端 |
|---|---|---|
| 引擎/参数/WDA 客户端（`src/engine`、`src/params`、`src/wda`） | 复用 | **直接复用**（纯 TS + fetch） |
| 图像检测 | ImageMagick（`tools/railDetect`） | **`src/vision`**（pako 解码 PNG + 纯 JS 像素分析，已验证与 ImageMagick 一致） |
| OCR | tesseract.js（`tools/ocr`） | **Apple Vision 原生模块**（`modules/vision-ocr`） |
| 标定坐标 | `adaptation/devices.json`（fs 读） | 打包进 App / AsyncStorage |
| 驱动入口 | `tools/wda-cli.ts` | App 内（`useEngine` 接真机 UI） |

## 已完成
- ✅ `src/vision/png.ts` + `src/vision/detect.ts`：纯 JS 图像检测，离线对真机截图验证与 ImageMagick 逐位一致。
- ✅ `modules/vision-ocr`：Apple Vision OCR 本地原生模块（Swift）。
- ✅ `src/vision/caption.ts`：从 OCR 框里筛选文案的纯逻辑。
- ✅ `src/engine/onDeviceUI.ts`：手机端 TikTokUI（截图 fetch → 纯 JS 检测 + 注入 OCR → 标定坐标点击，含页面状态机）。
- ✅ `src/app/realUI.ts` + `useEngine`：真机模式优先（有 vision-ocr 时），否则回退演示模式；顶栏显示「真机/演示」。

## 待做
- ⬜ 后台保活代码（见下方片段）+ app.json 配置。
- ⬜ Xcode 构建到设备、真机联调（标定坐标在新机型上需重标）。

## 构建步骤（用 Xcode，和装 WDA 一样，不需要 EAS）

你用 Xcode 直接 run 装 WDA，那本 app 同理——免费 Apple ID 直接 run 即可（7 天有效）。

### 1. 装依赖
```bash
npx expo install expo-location
```

### 2. 配置 app.json（保活 + 本地 HTTP + 定位权限）
在 `expo` 下加（见下）。

### 3. 生成原生工程
```bash
npx expo prebuild -p ios          # 已做过，会更新 ios/（含本地模块 vision-ocr）
```

### 4. Xcode 打开并运行到设备
```bash
open ios/autotk.xcworkspace        # 在 Mac 上
```
Xcode 里：选你的开发团队签名 → 选连接的 iPhone → Run。（或 `npx expo run:ios --device`）
> `modules/vision-ocr` 是本地 Expo 模块，prebuild 自动接入，无需手动加 Pod。

### app.json 需要加的字段
```jsonc
{
  "ios": {
    "infoPlist": {
      "UIBackgroundModes": ["location"],
      "NSLocationAlwaysAndWhenInUseUsageDescription": "用于后台保活，保持自动化运行",
      "NSLocationWhenInUseUsageDescription": "用于后台保活，保持自动化运行",
      "NSAppTransportSecurity": { "NSAllowsLocalNetworking": true }
    }
  },
  "plugins": ["expo-location"]
}
```

## 后台保活代码（装完 expo-location 后加，放在 App 入口顶层）
原理：请求「始终允许」定位 + 开启后台定位更新，iOS 就不挂起 App，JS 引擎可在后台持续驱动 WDA（原版同款 trick）。

```ts
// src/app/keepalive.ts
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";

const TASK = "autotk-keepalive";
// 任务体可空——目的只是让 iOS 因后台定位而不挂起 App。
TaskManager.defineTask(TASK, async () => {});

export async function startKeepAlive() {
  await Location.requestForegroundPermissionsAsync();
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== "granted") throw new Error("需要『始终允许』定位权限来保活");
  if (await Location.hasStartedLocationUpdatesAsync(TASK)) return;
  await Location.startLocationUpdatesAsync(TASK, {
    accuracy: Location.Accuracy.Lowest,
    deferredUpdatesInterval: 60000,
    showsBackgroundLocationIndicator: false,
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.Other,
  });
}
export async function stopKeepAlive() {
  if (await Location.hasStartedLocationUpdatesAsync(TASK))
    await Location.stopLocationUpdatesAsync(TASK);
}
```
然后在 App 启动 / 点「启动」时调 `startKeepAlive()`（需 `expo install expo-task-manager`）。

## 真机模式如何工作
App 内点「启动」→ `useEngine` 试 `createRealUI`（用 vision-ocr + 打包的 `adaptation/devices.json` 标定坐标 + `onDeviceUI`）→ 成功则真机模式，顶栏显示「真机」；Expo Go 里没有原生模块 → 回退「演示」。WDA 走 `localhost:8100`（与 App 同机）。
