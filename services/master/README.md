# services/master

装配 `@auto/core + driver-ios-wda + perceptor-vlm + plugin-tiktok` 的真实运行时。

入口：

- `start`：常驻多机调度；
- `smoke`：截图→单目标定位→可选点击；
- `workflow:test`：指定一台/一个工作流，只跑一次并自动留证。

完整部署与真机流程见 [`../../docs/真机部署手册.md`](../../docs/真机部署手册.md)。

## 推荐运行方式

日常由 Electron desktop 自动拉起 bundled master：

- desktop 内嵌 Hub；
- 自动设置 `HUB_URL`；
- 自动开启 `MASTER_DISCOVER=1`；
- 设置页配置 VLM 地址/扫描网段；
- stdout/stderr 写进 desktop 当日日志；
- 不需要另装 Node/pnpm。

**不要同时再手动启动 master。** 工程调试要手动运行时，关闭 desktop，或用 `MASTER_AUTOSTART=0` 打开 desktop。

## 常驻运行

配置模式：

```bash
cp devices.example.json devices.local.json
MASTER_CONFIG=./devices.local.json pnpm --filter @mc/master start
```

自动发现：

```bash
MASTER_DISCOVER=1 \
MASTER_SUBNET=192.168.11 \
MASTER_VLM_URL=http://192.168.11.9:8000 \
pnpm --filter @mc/master start
```

环境变量：

| 变量 | 作用 | 缺省 |
|---|---|---|
| `MASTER_CONFIG` | 配置路径 | `devices.json` |
| `MASTER_DISCOVER` | `1` 时自动扫描 WDA | 关 |
| `MASTER_SUBNET` | `/24` 前三段，多个逗号/空格分隔 | 从私网网卡/VLM 地址推断 |
| `MASTER_RESCAN_MS` | 持续重扫间隔 | 20000，最小 5000 |
| `MASTER_VLM_URL` | 无配置文件时的 VLM 地址 | `http://localhost:8000` |
| `MASTER_VLM_MODEL` | 无配置文件时的模型名 | `locateanything-3b` |
| `HUB_URL` | 设后启用 Hub/发布 | 未设 |
| `RECEIVER_PORT` | receiver socket 端口 | 4610 |

自动发现：

- 扫每个子网 `.1–254:8100`；
- 并发 64；
- 初扫后持续重扫；
- 新手机动态加入 Fleet；
- 自动身份为 `auto-<IP末段>`；
- 配置表已有同 host 时保留其 id/name/params。

## 配置

`devices.example.json` 是模板，真实配置用 `devices.json` 或 `*.local.json`，两者都已 gitignore。

关键字段：

- `vlm.url`：perception 地址；
- `devices[].id`：Fleet/Hub/receiver 的当前 deviceId；
- `devices[].udid`：库存身份；
- `devices[].host`：手机静态租约 IP；
- `schedule`：运行时段；
- `params.activeWorkflow`：`search/followMonitor/profileAndDM/off`；
- `staggerMs`：相邻手机启动错峰。

当前 StateStore 是内存实现；私信去重与日限额重启后不持久。

## smoke

TikTok 停在能看到目标的页面：

```bash
WDA_URL=http://192.168.1.51:8100 \
VLM_URL=http://192.168.1.9:8000 \
TARGET=feed.like-off \
pnpm --filter @mc/master smoke
```

- 默认只定位；
- 输出截图 `services/master/smoke-shot.png`；
- `TAP=1` 才真点；
- `TARGET=<注册表 id>` 或英文 phrase；
- `TARGETS=a,b,c` 会在同一截图上逐个单查，N 个目标 = N 次推理。

不存在组合查询或 P1 退化。

## 一次性工作流测试

配置必须满足：

- search：`searchKeywords` 非空；
- followMonitor：`following.moduleEnable=true`；
- profileAndDM：`persHome.moduleEnable=true`。

```bash
pnpm --filter @mc/master workflow:test -- \
  --config ./devices.local.json \
  --device test-01 \
  --workflow search
```

可选：

```bash
--artifacts ./test-artifacts
```

`--artifacts` 是产物根目录，每次运行仍会创建唯一时间戳子目录。

产物：

- `run.log`
- `events.jsonl`
- `summary.json`
- `before.png`
- `after.png`
- 失败时尽力生成 `failure.png`

`summary.json` 只保留 UDID 末 4 位；日志和截图仍可能包含业务文本，外发前需脱敏。

流程：

1. 读并校验生产配置；
2. 只选择指定设备；
3. WDA health；
4. 激活 TikTok；
5. 保存 before；
6. `recoverToFeed`；
7. 执行目标工作流一次；
8. 目标 Step 任何非 `ok` 都判失败；
9. 保存 after/失败现场与 summary；
10. 退出。

退出码：

- `0`：命令正常完成；
- `1`：接线/工作流失败；
- `2`：CLI 参数错误。

不要与常驻 master 同时运行。

## Hub 与发布

设 `HUB_URL` 后：

- 每台手机以平铺 device 身份注册；
- 每 5 秒上报状态；
- 接收参数补丁；
- 接收 pause/resume；
- 启动 receiver socket；
- 接收发布任务并串行执行。

发布依赖 receiver 已在线且 receiver hello id 等于 master deviceId。receiver 当前仍是构建期 URL/ID，多机量产尚未闭环。

## 测试

```bash
pnpm --filter @mc/master test
pnpm --filter @mc/master typecheck
```

2026-07-23 本地验证：82 个测试通过，typecheck 通过。真机 runner 与实时 Hub 日志仍需在线 WDA/TikTok/VLM/Electron 验证。
