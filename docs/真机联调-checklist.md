# autotk 2.0 · 空白 Windows 从零部署 + 真机联调 checklist

> 日期:2026-07-20　目标:一台**全新 Windows 机器** + 一台 iPhone,从零装到能跑 2.0 养号闭环并逐项验证。
> 分两部分:**第一部分 从零部署**(装工具链→GPU 感知服务→master→手机 WDA)、**第二部分 联调测试**(便宜→贵逐项验)。
> 命令默认 **PowerShell**(Windows);GPU 服务若走 WSL/Linux 用 bash。相关拍板见 `决策记录-2026-07-20.md`。

---

# 第一部分 · 空白 Windows 从零部署

## 0. 前置(硬件 / 账号)

- [ ] **这台 Windows 机器有 NVIDIA GPU**(实测 RTX 5060 Ti / Blackwell;跑感知服务)。**无 GPU** → 感知服务得放另一台有 GPU 的机,master 仍可在本机,`vlm.url` 指过去。
- [ ] **一台 iPhone**(实测 iPhone 8)+ 数据线;iPhone 与 Windows 机**同一个 WiFi/局域网**;路由器能设 **DHCP 静态租约**(D2)。
- [ ] **一个 Apple ID**:装 WDA 到非越狱 iPhone 必需(免费账号可 7 天签;长期用付费账号或走装机台)。
- [ ] Windows 10/11 x64,有管理员权限。

## 1. 装基础工具链

- [ ] **Git + Node + pnpm**(scoop 最省事):
  ```powershell
  # 装 scoop(若没有):
  Set-ExecutionPolicy -Scope CurrentUser RemoteSigned; irm get.scoop.sh | iex
  scoop install git nodejs
  npm i -g pnpm            # pnpm 版本需 ≥ 仓库 packageManager 钉的(10.28)
  node -v; pnpm -v         # 验证
  ```
- [ ] **Python 3.11 或 3.12**(给感知服务;torch cu128 有对应轮子)。**从 python.org 装最稳**(scoop 的 python 可能是过新版本、torch 无轮子)。装时勾 "Add to PATH"。
  ```powershell
  python --version         # 应是 3.11.x 或 3.12.x
  ```

## 2. 拿仓库 + 装 Node 依赖

- [ ] ```powershell
  git clone <你的仓库地址> D:\autotk    # 或已在本机
  cd D:\autotk
  pnpm install                          # 装全部 workspace(含 @auto/* + @mc/master;不含已退役 apps/mobile)
  pnpm --filter "@auto/*" --filter @mc/master test    # 离线自检:应 174 + 24 全绿
  ```
- **不通过**:`pnpm` 找不到 → 重开终端让 PATH 生效;测试红 → 先别往下,贴报错。

## 3. GPU 感知服务(perception)—— 大脑

**两条路线,二选一。** 想最快起测选 A;想和生产(D5=Ubuntu 24.04)一致、为将来 flash-attn/FP8 留路选 B。

### 路线 A · 原生 Windows(最快)
> bench 实测 BF16 768 在原生 Windows 与 WSL **同速**(~477ms);模型官方标注 Linux only 但已在 Windows 实测跑通(仅 sdpa,不碰 flash-attn/FP8——它们本就搁置 D7)。

- [ ] 建 venv 装 torch(**必须 cu128 轮子**,否则不认 Blackwell sm_120):
  ```powershell
  cd D:\autotk\services\perception
  python -m venv .venv; .\.venv\Scripts\Activate.ps1
  pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128
  pip install "transformers==4.57.1" "huggingface_hub<1.0" pillow torchao
  pip install -r requirements.txt        # fastapi/uvicorn/pydantic
  # 若模型加载报缺 decord/lmdb 等 → pip install decord lmdb(按报错补)
  python -c "import torch; print(torch.cuda.get_device_name(0), torch.cuda.get_device_capability(0))"
  #  应打印你的卡名 + (12, 0)
  ```
- [ ] 下模型(被墙走镜像):
  ```powershell
  $env:HF_ENDPOINT="https://hf-mirror.com"
  huggingface-cli download nvidia/LocateAnything-3B --local-dir .\LocateAnything-3B
  ```
- [ ] 起服务:
  ```powershell
  python server.py --model .\LocateAnything-3B --attn sdpa --max-side 640 --port 8000
  ```

### 路线 B · WSL2 Ubuntu 24.04(与生产一致)
- [ ] `wsl --install -d Ubuntu-24.04`(Windows 侧装好 NVIDIA 驱动即可,CUDA 自动透传进 WSL,**WSL 内不用再装驱动**)。
- [ ] 进 WSL,按 `LocateAnything-3B-5060Ti-性能报告.md` §9 建 **Python 3.11 venv + torch 2.8.0+cu128 + transformers 4.57.1 + huggingface_hub<1.0 + decord/lmdb/torchvision/torchao**,同样 `pip install -r requirements.txt`,下模型,`python server.py --model ./LocateAnything-3B --attn sdpa --max-side 640 --port 8000`。

### 验感知服务(两路线通用)
- [ ] `curl http://localhost:8000/health` → `{"ok":true,"max_side":640}`。
- [ ] **脱离手机先验模型**:拿 `bench/locateanything/shots/` 任一张真机截图,按 `services/perception/README.md` 的 curl 例把 `<BASE64>` 换成该图 base64 打 `/v1/chat/completions` → 响应含 `<box>…</box>`。**这一步确认"模型+服务"没问题,后面出错就只可能是手机/网络。**
- 记下本机局域网 IP(`ipconfig`),后面 master 与手机用 `http://<这台IP>:8000`。

## 4. master 主控(装配 N 台)

- [ ] 建设备配置表(**真实文件已 gitignore,不会误提交**):
  ```powershell
  cd D:\autotk\services\master
  copy devices.example.json devices.json
  # 编辑 devices.json:vlm.url 填 http://<GPU机IP>:8000;
  #   每台 id(编号)/udid/host(手机 DHCP 静态租约 IP);params 里配 searchKeywords 等
  ```
- [ ] **先别急着 start**——master 一起来就会探活连手机,得等第 5 步手机 WDA 起来。配好即可,启动在第二部分阶段 6/7。

## 5. 手机端(iPhone)从零:装 WDA + TikTok

> **2.0 手机只需 WDA + TikTok**,比旧系统轻一半:**不装 autotk App、不要激活码、不用标定**(那些是已退役旧引擎的步骤;VLM 直接出坐标)。

- [ ] **装 Apple USB 驱动**:Windows 装 **iTunes** 或 **「Apple 设备」App**(否则电脑连不上手机、不弹「信任此电脑」)。手机连线、解锁、点**「信任此电脑」**。
- [ ] **装 go-ios**(跨平台 CLI,Windows 可用,装/挂镜像/跑 WDA 都靠它):
  ```powershell
  npm i -g go-ios
  ios list                 # 能列出你的设备 UDID = USB 通了
  ```
- [ ] **装 WDA**:需要一个**已签名的 `WebDriverAgent.ipa`**(装机台云编译产物,或自己用 Apple ID 签的 WDA)。
  ```powershell
  ios install --path=WebDriverAgent.ipa
  ```
  装后手机:设置 → 通用 → VPN与设备管理 → **信任开发者证书**;设置 → 隐私与安全性 → **开发者模式** → 开 → **重启**。
  > 生产量产装机走**装机台**(`services/signing-station`,扫码即装 + 自动注册 UDID),测一台用 go-ios 直装即可,不必部署整个装机台。
- [ ] **挂开发者镜像 + 起 WDA**:
  ```powershell
  ios image auto           # 自动下载并挂载对应 iOS 版本的开发者镜像
  ios runwda --bundleid=<WDA的bundleid> --testrunnerbundleid=<...Runner> --xctestconfig=WebDriverAgentRunner.xctest
  # runwda 需保持运行、手机保持 USB 连着(维持 XCTest 会话;WDA 长会话稳定性是已知约束)
  ```
- [ ] **验 WDA 通**:WDA 默认监听 `0.0.0.0:8100`,起来后可经 WiFi 访问:
  ```powershell
  curl http://<手机WiFi_IP>:8100/status     # 返回含 "ready" / sessionId 即成功
  ```
- [ ] **TikTok 就绪**:手机登录好 TikTok 国际版、能正常刷视频;建议关 TikTok 自动更新(换版可能要重调 phrase)。
- [ ] **别让屏幕锁**:设置 → 显示与亮度 → 自动锁定 → **永不**;手机常插电、亮度调低。**屏一锁自动化就停。**
- [ ] **网络定型(D2)**:路由器给这台手机的 MAC 绑 **DHCP 静态租约**(固定 IP),把该 IP 填进 `services/master/devices.json` 的 `host`。

## 6. 本次不部署的服务(诚实边界)

2.0 核心养号闭环**只要 perception + master + 手机**。以下暂不涉及:
- **管理中心 Hub / desktop**:master↔Hub 对接尚未建(剩余工程);要几百台面板/批量改设置/文件夹发视频才需要。
- **license**:D4 拍板 MVP 不接(无激活门禁)。
- **signing-station 装机台**:量产"扫码即装"服务,自身需 Apple 凭据 + 域名 + docker;测一台手机用 go-ios 直装,不必部署。
- **telemetry 埋点**:可选;master 不设 `TELEMETRY_URL` 则 no-op。
- **发布链路**:缺"收视频 App"(D9,Mac-build)+ Hub 对接,见第二部分阶段 8。

---

# 第二部分 · 联调测试(环境已由第一部分起好)

> 原则:**便宜→贵**,每步过了再下一步。每步给:目的 / 命令 / 通过标准 / 不通过→动作。
> 冒烟命令在**驱动电脑**(= 本 Windows 机)跑。PowerShell 传环境变量:`$env:WDA_URL="..."; $env:VLM_URL="..."; pnpm --filter @mc/master smoke`。

## 阶段 1 · 单机冒烟:单目标 find+tap(链路通 + 单目标精度)
- [ ] TikTok 停在**能看到点赞键的视频页**;先只定位不点:
  ```powershell
  $env:WDA_URL="http://<手机IP>:8100"; $env:VLM_URL="http://<GPU机IP>:8000"; $env:TARGET="feed.like-off"
  pnpm --filter @mc/master smoke
  ```
- [ ] 打开生成的 `smoke-shot.png`,看报的像素中心是否压在白心上;确认后加 `$env:TAP="1"` 重跑 → 手机点赞心变红。
- **通过**:`✅ 命中`、坐标对、`TAP=1` 真点中。
- **不通过**:`❌ 未定位到`=目标不在屏/组合格式模型不吃(阶段 3)/region 过滤掉了;连不上=回第一部分网络项。

## 阶段 2 · 逐目标扫注册表(**= 640 精度地板实测,D6 安全网**)
每个 `$env:TARGET="<id>"` 单独跑,TikTok 停在该目标可见的页,看 `smoke-shot.png`。
- [ ] 右栏浮动:`feed.like-off`(未赞白心)、`feed.save-off`(未藏白书签)
- [ ] 系统权限窗(验**不走 /alert**):`sys.location-perm`(Don't Allow)、`sys.photo-perm`(Allow Access)
- [ ] **小目标酸性测试(640 成败看这个)**:`ad.shop-promo`(购物卡下方 × ,~15px)、`browser.inapp`(内嵌网页左上 ×)
- [ ] 评论区(停评论区打开页):`comments.commenter-avatar`(可改传具体短语 `the avatar of the comment that says '<片段>'`)、`dm.message-button`(在别人主页)
- [ ] 发布锚点:`publish.plus`/`publish.upload`/`publish.album-first`/`publish.next`/`publish.caption`/`publish.post`
- **通过**:每个 `✅ 命中` 且坐标压在目标上。
- **不通过**:
  - **`ad.shop-promo` 小 × miss/飘 → D6 回退触发**:perception 重启换 `--max-side 768` 复跑,稳了生产锁 768。
  - 个别 miss → 改 `packages/plugin-tiktok/src/target-registry.json` 的 `phrase`(**同步 `docs/specs/target-registry.json` 副本**)重跑。
  - **顺带 P2 温度对比**:同目标连跑 3–5 次看抖不抖;重启 perception 加 `--temperature 0.7` 对比,0.8 抖/幻觉更大就回 0.7。

## 阶段 3 · 组合多目标指令(**最大未验风险 + P1 退化验证**)
- [ ] 现 `smoke` 只测单目标;要测组合服从度,**给 smoke 加 `TARGETS=a,b,c` 多目标模式**(小改,可让我加),或进阶段 6 跑 search 看 master 日志的每步组合命中。
- **通过(服从)**:响应逐行 `1: <box>…`/`2: none`,在场目标都命中 → 组合可用,每步 1 次 VLM 调用(承载按 D1 ~10 台/卡)。
- **不通过(吐散文)**:自动走 **P1 退化**(只查首个最高优先目标),每步调用 ×2–3、承载下降 → 调 `perceptor-vlm/src/protocol.ts` 的 `buildLocateInstruction` 措辞再验;仍不服从则认退化为常态,承载下调反馈 D1。

## 阶段 4 · 危险自动处理(权限窗/弹窗)
- [ ] 等/造一个危险(购物卡、内嵌网页刷视频常出;权限窗首次用某功能出),看 master 日志:危险检出→tap 关掉→重观测继续。
- [ ] 危险关不掉 N 次 → 应 `alertOperator`(停手告警),**绝不盲滑**。
- **不通过**:卡住 → 没检出(hazard 未激活/phrase 不准,回阶段 2)vs 检出没关掉(坐标偏)。

## 阶段 5 · 私信可行性(**P3,平台风险未知数**)
- [ ] 测试配置开私信(`dm.dmEnable=true`+关键词+话术,`dmDailyCap` 设小如 2),对**自己小号**发。
- [ ] 观察:私信按钮在否→输入框出否→对方真收到否;验 P3 留痕:失败记 `dm-failed:<account>`+`stats.dmFailed`、**不占配额**、去重+限量生效。
- **不通过**:发不出/被拦 → 记录现象反馈需求方(私信需求方要求必做,重点是拿到"能不能发"的真机结论)。

## 阶段 6 · 单工作流端到端(search)
- [ ] **单台** `devices.json`(1 台)配 `searchKeywords`,起主控:
  ```powershell
  cd D:\autotk\services\master; $env:MASTER_CONFIG="./devices.json"; pnpm --filter @mc/master start
  ```
- [ ] 看日志走完:切搜索→输入词→提交→**选首个非广告非直播结果**→进流兼验→**只互动未点赞/未收藏**→评论区互动。
- **不通过**:某步反复失败 → 该步 expected/hazard 定位问题(回阶段 2)vs 手势坐标问题(改工作流手势)。
> 同法可验 `profileAndDM`(主页+私信)、`followMonitor`(打粉)。

## 阶段 7 · 多机 Fleet(`start` 扩量)
- [ ] `devices.json` 配 **2 台**(照 `devices.example.json`),`start`。
- [ ] 看**启动探活**:两台都 `✅ 可达 分辨率`;故意改错一台 IP → 该台 `❌ 不可达: 原因` 被跳过,另一台照常起。
- [ ] 看**错峰**(staggerMs 间隔不同时打 VLM)、两台互不串扰、`Ctrl-C` 优雅停(等当前批跑完)。
- **通过**:探活如实、错峰生效、稳态跑、优雅停 → **逐步加台数**,观察单卡吞吐是否成瓶颈(对齐 D1)。

## 阶段 8 · 发布(**暂缺件,阻塞中**)
- [ ] ⛔ 依赖未完成:视频**进相册**需"收视频 App"(D9,Mac-build,T7)+ Hub 对接 + master 发布编排(T8)。`publish.ts` 的 UI 操作已就绪(阶段 2 已验锚点),缺"确保视频在相册"前置件。

---

## 附:验证对应的拍板 / 回退触发

| 现象 | 拍板 | 回退/动作 |
|---|---|---|
| `ad.shop-promo` 小 × 在 640 miss | D6 | perception 换 `--max-side 768`,生产锁 768 |
| 框抖动大 / 幻觉多 | P2 温度 0.8 | perception 换 `--temperature 0.7` |
| 组合指令不服从 | P1 | 已自动退化查首个;调 `protocol.ts`;承载下调反馈 D1 |
| 私信被拦 | P3 | 拿真机结论反馈需求方 |
| 单卡台数到顶 | D1 纯 VLM ~10 台 | 多卡分片;VLM 优化后置 D7 |

**每验过一项,回填 `docs/项目进度报告.md` §7 真机待验项,并在此勾选。**
