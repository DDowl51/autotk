# services/master — 运行时 + 单机冒烟

装配 `@auto/core + driver-ios-wda + perceptor-vlm + plugin-tiktok` 成真运行时。两种入口:
- **多机运行时 `start`**(T5):读配置表 → N 台 driver + 启动探活 → 装配 Fleet 起主循环。
- **单机冒烟 `smoke`**:验证「截图→VLM 定位→点」单目标链路。

> 已接:Hub 对接(D3=A 平铺)+ 发布链路(收视频端 β1 通道 + 发布编排),设 `HUB_URL` 启用(不设=纯养号)。
> 尚未接:Postgres StateStore(DM 去重跨重启)、License(D4 MVP 不接)、收视频端 App(W2b,Mac 构建)。
> 测试:`pnpm --filter @mc/master test`(config/probe/assemble/hub/receiver/publish 纯逻辑,52 例)。

## 环境变量

| 变量 | 作用 | 缺省 |
|---|---|---|
| `MASTER_CONFIG` | 设备配置表路径 | `devices.json`(或首个命令行参数) |
| `HUB_URL` | 管理中心 Hub 地址;**设了才接 Hub + 发布链路** | 未设 = 纯养号模式 |
| `RECEIVER_PORT` | 收视频端(精简 autotk)连入的 socket 端口 | `4610` |

```bash
# 纯养号(不接管理中心):
MASTER_CONFIG=./devices.json pnpm --filter @mc/master start
# 接管理中心 + 发布:
HUB_URL=http://<Hub机IP>:4000 MASTER_CONFIG=./devices.json pnpm --filter @mc/master start
```

## 多机运行时(T5)

**配置表是单一真源(D2)**:`devices.json` 登记每台 `UDID↔IP↔编号`;master 按表拼 WDA 地址、启动探活(不可达即报,不静默)、装配。示例见 `devices.example.json`。

```bash
# GPU 机上(perception 服务起着、各手机 WDA + TikTok 已登录):
cp devices.example.json devices.json    # 改成你的 IP/UDID/编号 + 参数
MASTER_CONFIG=./devices.json pnpm --filter @mc/master start
#   或把路径作首个参数:pnpm --filter @mc/master start -- ./devices.json
#   Ctrl-C 优雅停止(等当前批跑完再退)。
```

配置要点:
- `vlm.url` = GPU 感知服务地址;`params` = 全局默认业务参数,每台可 `params` **深合并覆盖**(如只改某台 `dm.dmDailyCap`);`schedule` 同理可全局或每台。
- 每台 `id`(编号,唯一)= Fleet phoneId,将来也是 Hub deviceId(D3 平铺);`host` = DHCP 静态租约 IP;`port` 默认 8100。
- `size` 可不填——启动探活会查 `windowSize` 自动补;填了则以配置为准。
- `staggerMs` 错峰(默认 3000):相邻两台启动偏移,平滑 GPU/WiFi 峰值(单流 VLM ~2.1 张/s,别让 N 台同时打)。
- 探活拿不到分辨率又没配 `size` 的台、以及不可达的台,**跳过并列出原因**,其余照常起。

## 单机冒烟:验证「截图 → VLM 定位 → 点」整条链在真机上通

## 冒烟:验证「截图 → VLM 定位 → 点」整条链在真机上通

前置(你那边就绪):
1. iPhone 8 上 WDA 跑着(浏览器访问 `http://<手机IP>:8100/status` 有响应),TikTok 前台。
2. GPU 机上 `services/perception` 起着(`curl http://<GPU机IP>:8000/health` 返回 ok)。
3. 驱动电脑到这两个地址都通。

跑(把 TikTok 停在**能看到点赞键**的视频页):

```bash
pnpm install    # 首次
WDA_URL=http://<手机IP>:8100 VLM_URL=http://<GPU机IP>:8000 pnpm --filter @mc/master smoke
```

- 默认只**定位并报坐标**,把截图存 `smoke-shot.png`,对照看框准不准。
- 加 `TAP=1` 真点那个坐标(看手机是否点中)。
- `TARGET=feed.like-off`(注册表 id)或 `TARGET="the close button X"`(英文短语)换目标。
- `VLM_MODEL=<名>` 若你的服务要求特定 model 名。

```bash
# 例:定位「未点赞的白心」并真点
WDA_URL=http://192.168.1.50:8100 VLM_URL=http://192.168.1.9:8000 TARGET=feed.like-off TAP=1 pnpm --filter @mc/master smoke
```

## 读结果
- `✅ 命中 … 像素中心 (x, y)` + `smoke-shot.png`:打开图看那个坐标是不是压在目标上 → grounding 准不准。
- `TAP=1` 时看手机真机点没点中。
- `❌ 未定位到`:目标不在当前屏 / **组合指令格式模型不吃**(改 `packages/perceptor-vlm/src/protocol.ts`,单一真源)/ region 先验过滤掉了。

## 联调顺序(便宜→贵)
1. **单机冒烟**(单目标 find+tap):链路通 + 单目标精度。
2. 逐个验注册表关键目标(×/Don't Allow/白心/评论头像…):`TARGET=<id>` 挨个跑。同时这是 640 分辨率精度的实测(D6)。
3. 组合多目标(每步一次问多个):`protocol.ts` 的 `buildLocateInstruction` 格式,**真机第一个要调的点**(模型对组合格式的服从度未验;不服从会走 P1 退化=只查首个目标)。
4. 单工作流(search)→ **多机 `start`**(先 1–2 台跑通配置表+探活+错峰,再扩量)。
