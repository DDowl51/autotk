# autotk 激活门禁（接 license-saas）

启动时校验激活码，未激活 → 激活页；已激活 → 进主界面；后台定时心跳续期 + 收远程封禁。

## 文件
- `sdk/` —— **vendored 自 `license-saas/packages/sdk`**（去 .js 扩展名以兼容 Metro）。改 license SDK 后需同步过来。勿在此直接改逻辑。
- `config.ts` —— baseUrl / productKey / productSecret（可被 `EXPO_PUBLIC_*` 环境变量覆盖）。
- `secureStorage.ts` —— 用 Keychain（expo-secure-store）存 token。
- `deviceId.ts` —— iOS identifierForVendor，取不到则持久化随机 ID 兜底。
- `client.ts` —— 组装好的 `createLicenseClient()`。
- `gate.ts` —— 纯判定：心跳失败是否踢人（仅 revoked/not_activated）、错误码→中文提示。**有单测** `tests/license.test.ts`。
- `useLicense.ts` —— 门禁状态机 hook（loading/inactive/active + 心跳）。
- 激活页 UI：`../app/ActivationScreen.tsx`；接线在 `App.tsx`。

## 配置（必做）
1. 在 license 管理后台「产品」页新建产品 autotk → 拿到 **key** 和 **secret**（secret 只显示一次）。
2. 填入配置，二选一：
   - 改 `config.ts` 里的三个值；或
   - 项目根建 `.env`：
     ```
     EXPO_PUBLIC_LICENSE_URL=https://你的license服务器
     EXPO_PUBLIC_LICENSE_PRODUCT_KEY=prod_xxx
     EXPO_PUBLIC_LICENSE_PRODUCT_SECRET=xxxx
     ```
3. 在后台发激活码，安装后在激活页输入即可。

> secret 会打进客户端包（可被提取），这是纯客户端方案的固有上限；防破解靠服务端设备绑定 + 心跳 + 远程封禁。要更强可对 secret 做混淆/加固。

## 装依赖 + 重建（新增了原生模块）
新增 `expo-secure-store`、`expo-application`、`js-sha256`。需：
```
pnpm install            # 或 npm install
npx expo prebuild -p ios --clean
npx pod-install ios
npx expo run:ios --device --configuration Release
```

## 离线行为
缓存 token 未过期就算已激活（断网也能用）；心跳网络失败不踢人，仅服务端明确封禁/未激活才回激活页。
