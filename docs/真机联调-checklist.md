# autotk 2.0 真机联调 · 分步 checklist

> 日期:2026-07-20　适用:GPU 感知服务 + master + iPhone(WDA)已就位后,验证整条链在真机上跑通。
> 原则:**便宜→贵**——先验单目标、再逐目标、再组合、再工作流、再多机;每步过了再进下一步,别跳。
> 每步给:**目的 / 前置 / 命令 / 通过标准 / 不通过→动作**。命令按 bash(Linux/Mac/Git-bash);
> PowerShell 把 `A=x B=y cmd` 写成 `$env:A="x"; $env:B="y"; cmd`。
> 相关拍板见 `决策记录-2026-07-20.md`(640=D6 / 温度=P2 / 组合退化=P1 / 私信=P3)。

---

## 阶段 0 · 环境起栈(不碰手机也能做一半)

- [ ] **GPU 感知服务起着**:Ubuntu 24.04 机上,bench venv 内
      `python services/perception/server.py --model ./LocateAnything-3B --attn sdpa --max-side 640 --port 8000`
      → `curl http://<GPU机IP>:8000/health` 返回 `{"ok":true,"max_side":640}`。
- [ ] **感知服务单测(不用手机)**:拿 `bench/locateanything/shots/` 里任一张真机截图,按 `services/perception/README.md` 的 curl 例(把 `<BASE64>` 换成该图 base64)打一次 `/v1/chat/completions`
      → 响应 `choices[0].message.content` 含 `<box>…</box>`。**这一步先把"模型+服务"与"手机"解耦确认**,省得后面分不清是谁的锅。
- [ ] **手机就绪**:WDA 跑着(浏览器开 `http://<手机IP>:8100/status` 有响应)、TikTok **已登录**并在前台。
- [ ] **网络(D2)**:手机 IP 为路由器 DHCP 静态租约;**驱动电脑到 `手机IP:8100` 和 `GPU机IP:8000` 都通**(各 `curl` 一下)。
- [ ] **仓库就绪**:驱动电脑上 `pnpm install`(含 `@auto/*` + `@mc/master`)。

---

## 阶段 1 · 单机冒烟:单目标 find+tap(链路通 + 单目标精度)

**目的**:证明「WDA 截图 → VLM 定位 → 回坐标 → 真点」整条链在真机上闭合。

- [ ] 把 TikTok **停在能看到点赞键的视频页**。
- [ ] 只定位不点(先肉眼核对):
      `WDA_URL=http://<手机IP>:8100 VLM_URL=http://<GPU机IP>:8000 TARGET=feed.like-off pnpm --filter @mc/master smoke`
- [ ] 打开生成的 `smoke-shot.png`,看报的**像素中心是否压在白心上**。
- [ ] 真点验证:同命令加 `TAP=1` → 手机上点赞心**变红**。
- **通过**:`✅ 命中`,坐标落在目标上,`TAP=1` 手机真点中。
- **不通过**:
  - `❌ 未定位到` → 目标不在当前屏(换页)/ 组合格式模型不吃(见阶段 3)/ region 先验过滤掉了。
  - 命中但坐标偏 → 记下偏多少,进阶段 2 逐目标看是普遍偏还是个别目标偏。
  - 连不上 → 回阶段 0 的网络项。

---

## 阶段 2 · 逐目标扫注册表(**= 640 精度地板实测,D6 安全网**)

**目的**:逐个验关键 Target 的定位精度;这一轮**就是 640 分辨率的实测**(实测原本只覆盖过 768/512)。每个都 `TARGET=<id>` 单独跑,把 TikTok 停在**该目标可见的页**,看 `smoke-shot.png`。

右栏浮动类(验"只互动未点赞/未收藏"的白色识别):
- [ ] `feed.like-off`(未点赞白心)　- [ ] `feed.save-off`(未收藏白书签)

系统权限窗(验"**不走 WDA /alert**、截图+VLM+tap"路径):
- [ ] `sys.location-perm`(定位权限 Don't Allow——带地图那种,IMG_0008 实证过)
- [ ] `sys.photo-perm`(相册权限 Allow Access——发布会用到)

**小目标酸性测试(640 成败看这个)**:
- [ ] `ad.shop-promo`(购物促销卡下方的关闭 ×,IMG_0002,~15px 最小最孤立)
- [ ] `browser.inapp`(内嵌网页左上角 ×,IMG_0007)

动态/评论区类(停在**评论区打开**的页):
- [ ] `comments.commenter-avatar` —— 注意其 phrase 指"某条评论作者头像",单跑可改传具体短语:
      `TARGET="the avatar of the comment that says '<某条评论前几个词>'"`(工作流里本就是带具体片段调的)。
- [ ] `dm.message-button`(在**别人主页**页跑)

发布链路 UI 锚点(停在对应页逐个核;发布本身见阶段 8):
- [ ] `publish.plus` - [ ] `publish.upload` - [ ] `publish.album-first` - [ ] `publish.next` - [ ] `publish.caption` - [ ] `publish.post`

**通过**:每个都 `✅ 命中` 且 png 上坐标压在目标上。
**不通过**:
- **`ad.shop-promo` 小 × miss / 飘** → **这是 D6 的回退触发点**:重启 perception 换 `--max-side 768` 复跑本目标;稳了就生产锁 768(README/CLAUDE 里 640→768 一处参数)。
- 个别目标 miss → 该 Target 的 phrase 措辞不佳,改 `packages/plugin-tiktok/src/target-registry.json` 的 `phrase`(记得**同步 `docs/specs/target-registry.json` 副本**,逐字节),重跑。
- **顺带做 P2 温度对比**:同一目标连跑 3–5 次看框抖不抖;想对比就重启 perception 加 `--temperature 0.7` 再跑同批,若 0.8 抖动/幻觉明显更大 → 生产回 0.7(决策权在需求方)。

---

## 阶段 3 · 组合多目标指令(**最大未验风险 + P1 退化验证**)

**目的**:生产每步一次问「本页 hazards + 本步 expected」多个目标(省 GPU,承载量关键)。模型对**组合格式**(`buildLocateInstruction`:`1. …\n2. …` → `1: <box>… / 2: none`)的服从度**从未真机验过**。

- [ ] **需要一个多目标探针**——现 `smoke` 只测单目标。两选一:
  - (推荐)给 `smoke.ts` 加个 `TARGETS=a,b,c` 多目标模式(小改,可让我加),一次问多个,看返回格式;
  - 或直接进阶段 6 跑 `search` 工作流,看 master 日志里每步的组合查询命中情况。
- [ ] 停在**同时有 2+ 个已知目标**的页(如视频页:`feed.like-off` + `feed.comment` + `feed.rail`),发组合查询。
- **通过(模型服从)**:响应是 `1: <box>…` / `2: none` 逐行格式,在场目标都命中 → **组合可用,每步 1 次 VLM 调用**(承载按 D1 的 ~10 台/卡)。
- **不通过(模型不吃,吐散文)**:自动走 **P1 退化**(`perceptor-vlm` 已实现)——只查优先级最高的第一个目标,**每步 VLM 调用 ×2–3、承载等比下降**。此时:
  - 先试改 `packages/perceptor-vlm/src/protocol.ts` 的 `buildLocateInstruction` 措辞(单一真源),再验;
  - 若怎么调都不服从,认 P1 退化为常态,并把承载预期下调(反馈给 D1)。

---

## 阶段 4 · 危险自动处理(权限窗/弹窗)

**目的**:验决策循环的「危险优先」——页面转换时弹出的权限窗/购物卡/内嵌网页被**自动关掉再继续**,不是卡死也不是盲动。

- [ ] 制造或等一个危险出现(购物卡/内嵌网页在正常刷视频时常出;权限窗在首次用某功能时出),观察 master 日志:危险被检出 → tap 关掉 → 重观测继续。
- [ ] 危险**关不掉 N 次** → 应升级到 `alertOperator`(停手+告警),**绝不盲滑脱困**(旧系统血泪)。
- **通过**:危险自动消解,流程继续;关不掉时是"停+告警"而非乱动。
- **不通过**:卡住 → 看是没检出(该 hazard 未激活/phrase 不准,回阶段 2 修该目标)还是检出没关掉(tap 坐标偏)。

---

## 阶段 5 · 私信可行性(**P3,平台风险未知数**)

**目的**:TikTok 反垃圾会不会拦私信——这是**只能真机首验**的事。

- [ ] 用一份**测试配置**开私信(`dm.dmEnable=true` + `dmKeywords` + `dmTemplates`,`dmDailyCap` 设小如 2),对一个**你自己的小号**发。
- [ ] 观察:私信按钮在否 → 输入框出否 → 发送后对方**真收到**否。
- [ ] 验 P3 留痕:打开私信失败/输入发送失败 → 记 `dm-failed:<account>` + `stats.dmFailed`,**不占每日配额**;去重(同人不重发)+ 限量(到 cap 停)生效。
- **通过**:私信真发出且对方收到,失败有记录、配额/去重正确。
- **不通过**:发不出/被拦 → 记录现象反馈需求方;功能③按 D9 讨论过的降级(但需求方要求私信必做,故重点是拿到"能不能发"的真机结论)。

---

## 阶段 6 · 单工作流端到端(search)

**目的**:一台手机跑通一个完整业务闭环,验业务逻辑 + 真实导航手势 + 中途危险处理。

- [ ] 用**单台** `devices.json`(只 1 台),配 `searchKeywords`,`MASTER_CONFIG=./devices.json pnpm --filter @mc/master start`。
- [ ] 看日志走完:切搜索 → 输入词 → 提交 → **选首个非广告非直播结果**(找不到退第二个)→ 进流兼验 → **只互动未点赞/未收藏** → 评论区互动。
- **通过**:整条流顺下来,无失控、无盲滑;白心/白书签识别对(不重复点导致取消);广告/直播结果被跳过。
- **不通过**:某步反复失败 → 看是该步的 expected/hazard 目标定位问题(回阶段 2)还是手势坐标问题(改工作流手势)。

> 跑通 search 后,可同法验 `profileAndDM`(主页+私信)、`followMonitor`(打粉)——各自停在能起步的页。

---

## 阶段 7 · 多机 Fleet(`start` 扩量)

**目的**:验配置表 + 启动探活 + 错峰 + 多台共享一个 VLM 不打架。

- [ ] `devices.json` 配 **2 台**(照 `services/master/devices.example.json`),`start`。
- [ ] 看**启动探活**:两台都 `✅ 可达 分辨率`;故意拔一台网线/改错 IP → 该台 `❌ 不可达: 原因` 并被跳过,另一台照常起。
- [ ] 看**错峰**:两台启动有 `staggerMs` 间隔,不同时打 VLM。
- [ ] 跑一阵看:两台互不串扰(各自 PhoneSession),VLM 队列串行不崩;`Ctrl-C` 优雅停(等当前批跑完)。
- **通过**:探活如实、错峰生效、两台稳态跑、优雅停。**再逐步加到目标台数**,观察单卡吞吐是否成瓶颈(对齐 D1 承载)。
- **不通过**:探活连不上 → D2 网络/IP;VLM 排队拖垮 → 单卡台数到顶(多卡分片,D1)。

---

## 阶段 8 · 发布(**暂缺件,阻塞中**)

**目的**:文件夹工作流下发视频 → 手机相册 → TikTok 发布。

- [ ] ⛔ **依赖未完成**:发布视频**进相册**需"收视频 App"(D9,Mac-build,任务 T7)+ Hub 对接 + master 发布编排(T8)。`publish.ts` 的 UI 操作已就绪(阶段 2 已单验其锚点),但"确保视频在相册"这一前置件还没建。
- [ ] 待 T7/T8 落地后再验:桌面扫视频+文案 → master 收 `publish:task` → 触发收视频 App 存相册 → `publish.ts` 发布 → 回报。

---

## 附:本轮验证对应的拍板 / 回退触发

| 现象 | 对应拍板 | 回退/动作 |
|---|---|---|
| `ad.shop-promo` 小 × 在 640 下 miss | D6 生产分辨率 | perception 换 `--max-side 768`,生产锁 768 |
| 框 run-to-run 抖动大 / 幻觉多 | P2 温度 0.8 | perception 换 `--temperature 0.7` |
| 组合指令模型不服从 | P1 组合退化 | 已自动退化只查首个;调 `protocol.ts` 措辞;承载下调反馈 D1 |
| 私信被平台拦 | P3 私信必做 | 拿真机结论反馈需求方 |
| 单卡台数到顶 | D1 纯 VLM ~10 台 | 多卡分片;VLM 优化后置(D7) |

**联调期每验证一项,回填 `docs/项目进度报告.md` §7 的"真机待验项",并在此 checklist 勾选。**
