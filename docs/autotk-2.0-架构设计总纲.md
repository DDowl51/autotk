> **⚠️ 已被《自动化框架-架构设计总纲.md》取代(2026-07-10)。** 核心思想(四公理/四层/Step 合同/闭环)沿用并升级为「core 框架 + 按 app 插件(依赖倒置)」;范围也调整(5 功能含私信,砍推荐页养号)。权威以新总纲为准,本篇作历史。

# autotk 2.0 架构设计总纲(全新实现)

> 状态:**设计评审中(未动代码)** 日期:2026-07-10 作者:Claude
> 定位:**唯一权威设计文档**。收编并取代两份草稿(`内网集中识别服务器-架构设计`、`感知决策执行-操作模型设计`);实测依据见 `LocateAnything-3B-5060Ti-性能报告`。
> 前提:需求方已拍板**推倒重来、严格第一性原理、不复用旧代码**(旧代码仅作知识库,§12)。

---

## 0. 一页纸

**做什么**:把 autotk 从「引擎跑在手机上、逐机标定、on-device 识别」重构为「**主控机是大脑、手机是哑执行器、GPU 视觉模型是唯一指令源**」的集中式闭环系统。

**一句话架构**:
> 每台手机每步:主控经 WDA 拉截图 → 送 GPU 感知服务(LocateAnything-3B 定位 + OCR 读文本)→ 主控按 Step 合同决策 → 经 WDA 下发原子操作 → 验证 → 再循环。一台 Linux GPU 主机并发驱动 ~150 台手机。

**四个第一性事实决定一切**(§1),**四层操作模型**(L0 原子→L1 基本→L2 动作→L3 工作流,§4)承载全部逻辑,**Step 合同**(§5)是每步的统一形状,**主控循环**(§7)是运行时。

**规模**:单卡 ~150 台;几百台 = 多卡分片 + 多 AP WiFi(§9)。

---

## 1. 第一性原理(公理)

不可绕开的物理事实,一切设计由此推出:

- **A1 屏幕即唯一真相**。`snapshotMaxDepth:1` → 读不到元素树。唯一可靠信息 = 截图像素(+ 自己的操作历史)。任何「我以为在哪页」的内部状态都是待证实的猜测。
- **A2 动作是盲的**。tap/swipe/type 无返回值;效果只能由下一帧截图观测。
- **A3 环境对抗且非确定**。TikTok 随时插入广告/弹窗/权限窗/直播卡/内嵌网页/新版式;网络使页面转换时间不定。任一动作的结果是**分布**而非定值。
- **A4 识别有成本、有错误率、且是稀缺资源**。像素≈免费但只认形状;OCR 便宜只认字;VLM(LocateAnything,实测 ~0.5s/次)精准但贵、偶错、且是全系统吞吐瓶颈。

**由公理直接推出的架构决策**(每条都可回溯到公理):

| # | 决策 | 依据 |
|---|---|---|
| D1 | **闭环控制**:每个改变屏幕的操作,前有观测、后有验证;禁止跨不确定边界的连续盲操作 | A1+A2+A3 |
| D2 | **每步显式声明 expected(期望)与 hazards(危险)**,是一等公民不是异常处理 | A3 |
| D3 | **VLM 是决策/坐标的唯一来源**(需求方定);OCR 只读文本喂业务逻辑;**盲滑是唯一例外**(固定手势,但前置危险检测) | A4 + 需求方 |
| D4 | **固定 sleep 是错误原语**,替换为 `await(target, timeout)` 轮询 | A2+A3 |
| D5 | **手机零业务逻辑**:手机只跑 WDA(L0 端点),全部智能在主控 | A1(反正读不到树,不如集中) |
| D6 | **onFail 最后一级永远是「停手+告警」**,绝不盲动脱困 | A1(误判正常页而乱动代价极大——旧系统血泪) |
| D7 | **感知集中在 GPU 服务、按需批处理**;主控不碰 GPU | A4(稀缺资源要集中调度) |

---

## 2. 系统拓扑

```
┌───────────────────────── Linux GPU 主机 (RS, 1 台带 RTX 5060 Ti) ─────────────────────────┐
│                                                                                          │
│  services/master (Node/TS)                          services/perception (Python)         │
│  ┌────────────────────────────────────┐            ┌──────────────────────────────────┐ │
│  │ Orchestrator 多机编排               │            │ FastAPI + 批处理队列              │ │
│  │  每台一个 PhoneSession + 主控循环   │──HTTP──────▶│  LocateAnything-3B(grounding)     │ │
│  │  L3 工作流 → L2 动作 → L1 基本操作  │◀──boxes────│  PaddleOCR(文本读取)              │ │
│  │  L0 WdaClient(每台一实例)          │            │  图像预处理(下采样/JPEG 解码)     │ │
│  └───────────────┬────────────────────┘            └──────────────────────────────────┘ │
│                  │ 接管理中心(聚合上报 N 台)                                              │
└──────────────────┼───────────────────────────────────────────────────────────────────────┘
     │ WDA HTTP (LAN/WiFi)  截图↓ JPEG  原子操作↑                    │ socket.io
┌────┴─────┬──────────┬──── ... ────┐                        ┌──────┴──────────────────┐
iPhone8#1  #2         #3           #N (~150/主机)             services/hub(现有,复用)
WDA:8100   :8100      :8100        :8100                     管理中心:看板/批量配置/告警
(只跑 WDA + TikTok 前台,零我方代码)                          services/telemetry-collector(现有)
```

**关键**:手机不再跑 RN app。手机侧 = WDA(装机台重签下发)+ TikTok。「手机上传截图」实为主控经 WDA `/screenshot` 拉取,「下发操作」实为 WDA `/actions`——主动权全在主控(pull 模型),手机零部署零维护。

---

## 3. 技术栈与包布局

**复用现有 monorepo**(pnpm workspace),新增两个包:

```
services/
  master/          @mc/master   ★新   主控编排(Node/TS,Linux 常驻)
  perception/            ★新   GPU 感知服务(Python;独立于 pnpm,自带 venv)
  hub/             @mc/hub      复用  管理中心云 Hub(socket.io)——master 作聚合方接入
  signing-station/            复用  装机台:UDID 注册 → 写入 DeviceRegistry 的数据源
  telemetry-collector/ @telemetry/collector 复用 埋点
  license/         @license/api 复用  授权(粒度见 §11 待定 D4)
packages/
  shared/          @mc/shared   复用/扩  Hub 协议(加「聚合方/子设备」语义,§8)
  telemetry-sdk/   复用
```

**技术选型与理由**:

| 组件 | 选型 | 理由 |
|---|---|---|
| 主控编排 | **Node.js + TypeScript** | 复用现有 Hub/shared/team 技能;引擎是 I/O 密集,async 多路复用几百路天然合适 |
| L0 WDA 客户端 | **TS class,每台一实例** | 构造性事实(每台独立 baseUrl+sessionId);`fetch` 跨端 |
| GPU 感知服务 | **Python + FastAPI + PyTorch/transformers**(LocateAnything)+ **PaddleOCR** | 模型只有 Python 实现;拆独立进程,Node 不碰 GPU;FastAPI 批处理队列 |
| master↔perception | **HTTP,图像走 JPEG 二进制,服务端队列批处理** | 简单;批处理在服务端聚合多台请求成 batch(§6) |
| 决策核状态 | **内存 PhoneSession**;审计/埋点入 Postgres(复用 telemetry) | 状态即索引,屏幕是真相(A1),无需重持久化 |
| 配置下发 | **复用 Hub**;master 收批量配置分发到各 PhoneSession | 不重造管理中心 |

> 为何 master 用 Node 而非 Python:决策核是纯逻辑 + 大量并发 I/O(WDA HTTP),Node async 是强项;把 GPU 重活隔离到 Python 服务即可。两进程各司其职。

---

## 4. 四层操作模型(核心)

```
L3 工作流 Workflow   forYou养号 / kwSearch搜索 / persHome主页 / publish发布 / 分时段调度
                     = 动作序列 + 业务概率决策(chance/jitter)。纯逻辑,不碰屏幕。
L2 动作   Action     openComments / likeVideo / search(kw) / publishVideo(v,c) …
                     = Step[] 序列;每个 Step 带合同(§5)。声明式、可 mock 单测。
L1 基本操作 BasicOp   locate(target) / tapTarget(t) / await(t,timeout) / check(t)
                     / handleHazards(activeSet) / swipeNext(盲滑) / typeInto(t,s) / readText(region)
                     = 感知(调 L1 感知客户端)+ 动作(调 L0)的黏合。
L0 原子   Primitive  tap(x,y) / swipe(p1,p2,dur) / typeText(s) / screenshot() / activateApp(id)
                     / pressHome()   (系统弹窗不走 /alert——统一截图+VLM定位+tap,见 L0 规格书)
                     = WDA 端点 1:1。手机唯一可见层。无语义、无失败判断(A2)。
```

**层间铁律**:
- L0 是**手机与主控的全部协议面**;上层永不直接拼 WDA URL。
- L1 的 `tapTarget = locate(VLM) + tap(L0)`;`await` 取代一切 sleep(D4)。
- **`swipeNext` 是盲滑**(D3 例外):固定/标定手势,不问 VLM 坐标;但调用前该 Step 的 hazards 已被检测(确认在信息流无弹窗才滑),不牺牲安全。其余动作(点赞/关弹窗/点结果)一律 VLM 定位。
- L2 每个动作 = 一张「步骤合同表」,声明式。
- L3 是纯决策层(概率模型),不知道屏幕细节,只调 L2 动作。

### L0 接口(TS)

```ts
class WdaClient {
  constructor(baseUrl: string, opts?: { timeoutMs?: number });
  createSession(): Promise<void>;       // 空会话 + applyFastSettings(snapshotMaxDepth:1…)
  resetSession(): void;                 // WDA 重启自愈开关
  activateApp(bundleId: string): Promise<void>;
  screenshot(): Promise<Buffer>;        // PNG bytes(主控侧再转 JPEG 送感知)
  tap(p: Point): Promise<void>;         // W3C /actions
  swipe(from: Point, to: Point, durMs: number): Promise<void>;
  typeText(s: string): Promise<void>;   // /wda/keys
  pressHome(): Promise<void>;
  // 注:不提供 /alert/* 系列——系统弹窗(权限窗)统一按 sys.* 危险目标处理:
  // 截图拍得到(springboard 在 WDA 截图内,IMG_0008 实证)、普通 tap 点得到(真机实证);
  // /alert 对带地图的定位窗读不到,是不可靠的第二通道,违背单一路径原则,弃。
}
```

---

## 5. Step 合同 —— 「双识别」思路的形式化

需求方原话:「给一系列广告识别目标,识别到就特殊处理(找关闭按钮);再给一个普通的下一步识别目标,没广告或识别到下一步就执行下一步。」形式化为:

```ts
interface Step {
  intent: string;               // 人读意图,同时作为 VLM 组合查询的语境
  act?: BasicOp;                // 本步要做的基本操作(缺省 = 纯观察步)
  expected: TargetId[];         // 期望目标:证明「环境正确/可以做」的屏幕特征
  hazards: TargetId[];          // 危险目标 = 全局集 ∪ 页面专属集(自动并入全局)
  verify: TargetId[];           // 操作后成功判据(通常 = 下一步的 expected)
  timeout: number;              // 等待期望/验证上限(ms)
  onFail: Escalation;           // 升级链,最后一级永远是 alertOperator(D6)
}

type Escalation =
  | { retry: number }                          // 重试 N 次
  | { variants: BasicOp[] }                    // 换手势变体(如上滑换列)
  | { recover: 'backToFeed' }                  // 回基地
  | { alertOperator: string };                 // 停手 + 通知管理中心(终点)
```

### 决策函数(每步统一执行,伪码)

```
decide(step, session):
  loop until timeout:
    shot = WDA.screenshot(phone)                       # A1 观测
    result = perception.query(shot, {                  # 一次 VLM 调用,组合查询(§6)
      locate: [...step.hazards, ...step.expected]      # 危险 + 期望一并定位
    })
    # ① 危险优先(A3):按严格全序,任一命中即处理后重观测
    for hz in step.hazards ordered by class:           # 系统级 > 遮挡级 > 分类级
      if result.hit(hz):
        execute(hazards[hz].handler, result.box(hz))   # deny / 点关闭钮 / 划走
        continue loop
    # ② 期望在 → 环境正确,执行本步动作
    if result.hitAny(step.expected):
      if step.act: execute(step.act, result)
      if await(step.verify, step.timeout): return SUCCESS   # ③ 轮询验证(替代 sleep)
      else: return escalate(step.onFail)
    # ④ 期望不在 ≠ 失败:先当「没加载完」,继续 loop 轮询(D4 吸收慢网络)
  return escalate(step.onFail)                          # ⑤ 超时才升级
```

要点(全部回溯公理):**危险优先于期望;「没识别到期望」先当加载中而非失败;验证是标配;onFail 终点是停手告警不盲动。**

---

## 6. 感知子系统(GPU 服务)

**分工(D3)**:
- **LocateAnything-3B = 坐标/决策唯一源**。输入截图 + 目标短语,输出归一化框 `<box>` 0-1000。
- **PaddleOCR = 文本读取**。输入截图区域,输出文字(评论内容、视频文案),喂 L3 业务逻辑(正向/反向提示词匹配、评论匹配)。**不参与坐标决策。**
- **无像素启发式决策层**(相较旧系统的重大简化):VLM 是大脑,不再靠白带/红点算坐标。

**组合查询(承载量的关键)**:每步一次 VLM 调用,`locate: [hazard1, hazard2, …, expected]` 一并定位——用模型的**多目标 grounding** 能力,返回其中「存在」的框。这样**每步 1 次 VLM**(与 §承载量假设一致),而非每个目标一次。

**感知服务接口**:

```
POST /perceive   (master → perception)
  body(msgpack/json): {
    reqId, phoneId,
    image: <JPEG bytes, 已下采样到 512/640>,   # 下采样在 master 侧做,省带宽
    queries: [{ id, phrase }],                  # 组合:hazards + expected
  }
  resp: { reqId, boxes: [{ id, bbox:[x1,y1,x2,y2]/1000, score }] }  # 缺席目标不返回或 score<阈值

POST /ocr        (master → perception)
  body: { image, region?:[x,y,w,h] }
  resp: { lines: [{ text, bbox }] }
```

**服务端批处理**:请求进队列,~10–30ms 窗口聚合多台成一个 batch 喂 GPU(同分辨率、无 padding,吞吐最优),返回后按 reqId 分发。**这是单卡带 ~150 台的实现关键**。

**⚠️ 待验证风险**:grounding 模型「目标不存在时返回空」的可靠性(可能幻觉出框)。缓解:①置信度阈值 ②多目标检测模式 ③危险目标「疑似命中」再单独确认一次。列为感知服务上线的验收项(§10 G2)。

---

## 7. 主控运行时

### PhoneSession(每台一个,内存)

```ts
interface PhoneSession {
  udid: string; ip: string; wda: WdaClient; profile: DeviceProfile;  // iPhone8 全场共享一份 profile
  cursor: { workflow: string; action: string; stepIdx: number };     // 在哪个工作流/动作/第几步
  history: ScreenSummary[];        // 最近 N 帧摘要(caption/命中目标)→ 时序判断
  hazardLog: { id: string; at: number }[];  // 频控 + 防死循环(同一弹窗 3 次关不掉 → 升级)
  health: { wdaAlive: boolean; failStreak: number; alert: string | null };
  params: AutomationParams;        // 该机业务参数(Hub 下发)
}
```

### 主控循环(每台独立并发)

```
for each phone concurrently:
  step = currentStep(session)          # L3 工作流 → L2 动作 → 当前 Step
  outcome = decide(step, session)      # §5;VLM 调用汇入 GPU 批
  advanceOrEscalate(session, outcome)  # 更新 cursor / hazardLog / health
```

**冲突裁决(A1 铁律)**:session 说「应在评论区」而截图说「在信息流」→ **以截图为准**,session 回写纠偏。上下文是索引,屏幕是真相。

**并发**:单进程 async 多路复用 N 台;VLM 调用非阻塞地进感知服务队列,Node 侧不等 GPU 空转。每台加相位偏移错峰,平滑 GPU/WiFi 峰值。

### 健康与自愈

- WDA 掉线 → 指数退避重连 + `resetSession()`;连续失败 → 标记离线、告警 Hub。
- 同一危险目标 N 次关不掉 → `alertOperator`(D6),不盲动。

---

## 8. 与管理中心(Hub)对接

- **Hub 复用现有 socket.io**,但连接方从「手机」变「主控 RS」。
- master 作**聚合方 HubClient**,代理其辖 N 台:上报每台状态/日志/告警、接收批量配置分发到 PhoneSession、转发发布任务。
- **协议扩展(D3 待定)**:`packages/shared` 加「聚合方 + 子设备」两级语义,或 RS 把每台当独立设备平铺上报。见 §11 D3。

---

## 9. 承载量与分片(实测支撑)

依据性能报告(实测 477ms/张 + 外推):

- **单卡承载**(生产:Linux+flash-attn+FP8+批处理+512 压缩 + 慢节奏 + 盲滑)= **~150 台**(区间 90–180,待批处理曲线定案)。
- **几百台 = 多卡分片**:300–450 台 ≈ 2–3 张 5060 Ti;DeviceRegistry **按 RS 分区**,架构从第一天支持水平扩展。
- **两个非算力天花板**(与 GPU 无关,是几百台的真实约束):
  - **WiFi**:几百台 iPhone 并发关联单 AP 不现实 → 企业级多 AP / 按 AP 分片 / 或 USB 有线。
  - **WDA 长会话稳定性**:几百个长连的运维 → 健康巡检 + 自愈 + 告警。
- **压缩两旋钮**:下采样(512,提 VLM 吞吐,精度地板待测)在 master 侧做;JPEG(省 WiFi/截图)在传输前做。

---

## 10. 测试策略(第一性:决策核可离线全覆盖)

- **决策核(§5)纯逻辑**:喂 **mock 截图序列 + mock 感知结果**,断言每步走向。**不碰真机即可覆盖所有分支**(危险优先/期望轮询/超时升级/冲突裁决)。这是四层解耦的最大红利。
- **L0/WDA 接线**:只能真机验(WDA × TikTok);做冒烟脚本。
- **感知服务**:用 `bench/locateanything/shots/` 做精度回归(框 vs 手工标注),CI 跑延迟基准。
- **工作流(L3)**:mock UI 跑通整条链路(对齐旧 mockUI 思路,代码新写)。
- **影子对比**:新旧系统同参数并跑,比互动成功率/误操作率(§12 切换门槛)。

---

## 11. 待定决策(需求方拍板)

- **D-资源**:单卡目标锁 ~150、几百台加卡——是否接受「多卡 + 多 AP」的成本结构?(vs 死磕单卡)
- **D2**:手机 IP 方案——固定 IP / DHCP+mDNS / 端口扫描发现 8100?
- **D3**:Hub 用「聚合方+子设备」两级,还是 RS 平铺上报每台为独立设备?
- **D4**:License 授权粒度——按手机 / 按 RS / 按手机槽位?(影响计费与 SDK 接法)
- **D5**:感知「危险不存在」的判定可靠性未验(§6 风险)——上线前必测,若不达标需加二次确认(增成本)。
- **D6**:GPU 主机 OS——生产锁 Linux(flash-attn 必需);现有 Windows GPU 机是否转 Linux 或加 Linux 机?

---

## 12. 旧代码:知识库,一行不搬

三类资产提炼带走(数据导出为配置、规格作输入文档、教训升为公理),**代码不复用**:

| 类 | 旧资产 | 提炼为 |
|---|---|---|
| 数据 | popupDetect 签名+closeAt、alertIntent 词表、devices.json/anchors、广告/直播特征 | Target 注册表 JSON、hazards 数据、profile 数据 |
| 规格 | WDA 硬约束、AutomationParams+概率模型语义、Hub 协议、像素算法阈值经验 | L0 规格书、L3 业务规格、协议规格、感知参数 |
| 教训 | guardBeforeSwipe / closeCommentPanelSafely / 文案相似度 / 「不盲动只告警」/ 弯引号坑 | 已升为 §1 公理与 §5 合同 |

**不带走**:onDeviceUI/calibratedUI 双实现、TikTokUI 适配实现体、所有绕旧结构的补丁。TikTokUI 的 26 个方法**语义**仅作 L2 动作库的需求清单参考。

---

## 13. 落地里程碑(G 系列;双轨并跑至切换)

**运营前提**:旧 `apps/mobile` 继续服务存量买家、OTA 修复不停;新系统平行从零长,影子达标后**一次性切换**,不混血。

| 阶段 | 交付物 | 验收 |
|---|---|---|
| **G0 规格提炼** | §12 三类资产导出成文:Target 初始注册表(JSON)、L0 规格书、L3 业务规格、坑清单 | 注册表覆盖本会话全部真机弹窗;规格无歧义 |
| **G1 L0 客户端** | `services/master` 骨架 + 多实例 `WdaClient` + L0 原子 | 双机并发原子操作互不串话;超时/会话自愈达标 |
| **G2 感知服务** | `services/perception`:LocateAnything 批处理 + PaddleOCR + 组合查询 + 下采样;**跑完性能报告 §8 Linux 基准** | 精度回归过;批处理吞吐曲线出;§6 缺席判定风险验收 |
| **G3 决策核** | Step 合同 + decide 决策函数 + await 原语 + PhoneSession | **mock 截图序列离线单测全绿**;真机单动作(search)全程无死 sleep |
| **G4 动作库+工作流** | L2 动作库(以 TikTokUI 26 语义为清单)+ L3 工作流(重写概率模型)+ 盲滑 | 真机全流程夜跑;与旧系统影子对比达标 |
| **G5 多机+Hub+切换** | Orchestrator 并发 N 台 + Hub 聚合对接 + DeviceRegistry 分区 | 2→N 台稳态、无串话;管理中心看板/配置/告警全通;走切换清单、旧系统退役 |

---

## 附:关键接口速查

```ts
// Target 注册表(声明式感知)
interface Target {
  id: string;                    // ad.shop-promo / sys.location-perm / feed.live-tag / nav.search-input …
  phrase: string;                // 送 VLM 的英文定位短语(组合查询用)
  kind: 'hazard' | 'expected';
  hazardClass?: 'system' | 'overlay' | 'category';   // 决定 handler 语义与优先级
  handler?: 'deny' | 'allow' | 'tapBox' | 'swipeAway' | 'skip' | 'back';
  // 仅 hazard。deny/allow/tapBox 执行上都是「点 VLM 定位到的框」;deny/allow 是语义标签
  // (审计:养号工作流断言绝不含 allow;allow 仅 publish 页)。系统弹窗不走 WDA /alert。
  ocr?: { text: RegExp };        // 可选:OCR 快筛前置(如权限窗先看有无「不允许」)
  region?: [number, number, number, number];         // 归一化先验区域,缩小搜索降误判
}
```

> 本文为设计评审稿。批准后从 G0 起步,每阶段独立提交、真机验证、push main。
