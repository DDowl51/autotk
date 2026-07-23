# 管理中心

当前管理中心是 Electron 桌面端，不再依赖退役的 `apps/mobile` 作为自动化引擎。

## 当前拓扑

```text
apps/desktop
├─ renderer：设备、配置、日志、发布、设置
├─ Electron 主进程
├─ 内嵌 services/hub
├─ 内嵌 services/master（master.cjs）
└─ 调用 services/publisher

services/master
├─ 自动发现 iPhone WDA
├─ 为每台手机向 Hub 注册平铺设备身份
├─ 上报状态和工作流/WDA 日志
├─ 接收配置、暂停/恢复与发布任务
└─ 驱动 @auto/* 工作流
```

GPU perception 独立部署在 Ubuntu 24.04。完整拓扑、端口和操作步骤见 [`../真机部署手册.md`](../真机部署手册.md)。

## 组成

| 路径 | 职责 |
|---|---|
| `packages/shared` | Hub 协议、设备状态、配置补丁与发布消息 |
| `services/hub` | socket.io 注册、状态、日志、配置、控制和发布路由 |
| `services/publisher` | 文件夹扫描、文案、排期、去重与 LAN 文件服务 |
| `services/master` | 真机发现、Fleet、Hub 设备身份、工作流和 receiver 编排 |
| `apps/desktop` | Electron UI、内嵌服务生命周期、后台状态与本地日志 |

## 已实现

- 设备注册、在线/运行/告警状态；
- 搜索、筛选、排序、批量设置；
- 工作流选择与远程暂停/恢复；
- 每台设备的实时日志缓冲；
- 文件夹发布任务与进度；
- desktop 自动启动 Hub 和 bundled master；
- master 运行状态、VLM 地址、扫描网段、扫描时间、发现/上线数和最近错误；
- 保存并重启、一键重启后台、打开日志目录。

Hub 日志是内存环形缓冲，不是持久审计库。完整排障证据使用 desktop 当日文件日志和 `workflow:test` 产物。

## 本地开发

仓库根目录执行：

```bash
pnpm install
pnpm --filter @mc/shared build
pnpm --filter @mc/hub build
pnpm --filter @mc/publisher build
```

终端 1：

```bash
pnpm --filter @mc/desktop dev:renderer
```

终端 2：

```bash
VITE_DEV_SERVER_URL=http://localhost:5173 pnpm --filter @mc/desktop electron
```

desktop 默认自动启动内嵌 master。只调 UI/Hub、不希望占用 WDA 时：

```bash
MASTER_AUTOSTART=0 VITE_DEV_SERVER_URL=http://localhost:5173 pnpm --filter @mc/desktop electron
```

无真机演示：

```bash
pnpm --filter @mc/hub start
pnpm --filter @mc/hub mock -- d1 手机1
```

不要让独立 Hub 与 desktop 内嵌 Hub 同时占用同一端口；不要让手动 master 与 desktop 内嵌 master 同时连接同一台手机。

## 验证

```bash
pnpm --filter @mc/hub test
pnpm --filter @mc/hub typecheck
pnpm --filter @mc/desktop test
pnpm --filter @mc/desktop typecheck
pnpm --filter @mc/desktop build:main
```

这些命令不证明 Electron Windows 安装包、真实 Hub socket、WDA 或发布真机链路已经通过。真机记录使用 [`../真机联调-checklist.md`](../真机联调-checklist.md)。

## 当前限制

- desktop 最近错误是进程内状态，重启前应先保存日志；
- Hub 日志缓冲不落库；
- master StateStore 仍是内存实现；
- receiver 的 master 地址和 deviceId 仍在构建期写入，阻塞多机发布量产；
- Windows 安装包、真实 socket、真机工作流和发布仍需按部署手册验收。
