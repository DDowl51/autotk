# management-center

autotk 管理中心（独立项目）：**云 Hub + Electron 桌面端**。看几百台手机状态、批量改设置、文件夹工作流发视频。

## 结构（npm workspaces）
```
packages/shared    协议类型 + AutomationParams（手机/Electron/Hub 共用）
services/hub       云协调中心（socket.io 实时；设备注册/状态/配置/任务路由 + 视频中转）
apps/desktop       Electron 桌面端（React+Vite+Ant Design：看板/批量设置/发视频）
```

## 架构
手机和 Electron 都连云 Hub（穿 NAT/跨网）；配置/状态走 Hub；视频同局域网直传、跨网经 Hub 中转。详见 `autotk/docs/plan/req1-management-center.md`。

## 本地跑（阶段 1 看板）
```bash
npm install                       # 根目录，workspaces 一次装全
# 终端 1：起 Hub
cd services/hub && npm start                 # :4000
# 终端 2：模拟几台手机（没真机时演示用）
cd services/hub && npm run mock -- d1 手机1
cd services/hub && npm run mock -- d2 手机2
# 终端 3：起桌面端
cd apps/desktop && npm approve-scripts electron   # 首次：放行 electron 下载二进制
npm run dev:renderer                          # vite :5173
VITE_DEV_SERVER_URL=http://localhost:5173 npm run electron   # 开 Electron 窗口
```
看板顶部填 Hub 地址（默认 http://localhost:4000），即可看到设备上线/运行/告警。

测试：`cd services/hub && npm test`（注册表 4 + socket.io e2e 2）；`cd apps/desktop && npm test`（reducer 3）。

## 阶段
- ✅ **阶段 1**：Hub 骨架 + 设备注册/状态上报 + Electron 设备看板 + mock 手机端 e2e。
- 阶段 2：批量设置下发 + 即时生效（抽 `packages/shared` 的 AutomationParams）。
- 阶段 3：文件夹工作流发视频（依赖 #4，真机）。
