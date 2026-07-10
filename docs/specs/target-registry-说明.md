# Target 注册表说明(G0)

配套数据文件:[`target-registry.json`](target-registry.json)。这是 autotk 2.0 **声明式感知**的单一数据源——所有「要识别什么、识别到怎么办」都在这张表里,不写死在代码。总纲见 `../autotk-2.0-架构设计总纲.md`(§5/§6/附)。

## 它是什么

每个 **Target** 是一个可被感知层识别的对象。分两类:
- **hazard(危险)**:出现即需处理(广告/弹窗/权限窗/直播卡)。带 `handler`(怎么处理)。
- **expected(期望)**:证明「环境正确/可以做下一步」的屏幕特征(动作栏、输入框、按钮)。

决策函数(总纲 §5)每步做一次 VLM **组合查询**:把「本页激活的 hazards + 本步 expected」的 `phrase` 一并送模型,返回其中存在的框;**危险优先**处理,否则对 expected 执行动作。

## 字段

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | ✓ | 命名空间点分:`域.名`(如 `ad.shop-promo`、`feed.like`) |
| `kind` | ✓ | `hazard` \| `expected` |
| `phrase` | ✓ | **送 LocateAnything 的英文定位短语**(grounding query)。表达要具体、可定位 |
| `hazardClass` | hazard | `system`(iOS 系统窗)\| `overlay`(应用内浮层)\| `category`(不关而绕:直播/广告评论)。**决定优先级与 handler 语义** |
| `handler` | hazard | `deny` / `allow` / `tapBox`:**执行上都是「点 VLM 定位到的框中心」**(系统弹窗不走 WDA /alert——该通道对带地图的窗读不到,已弃,见 L0 规格书 §7;tap 点系统弹窗按钮已真机实证)。`deny/allow` 是**语义标签**:phrase 指向拒绝/允许按钮,供审计(养号工作流断言**绝不含 allow**;allow 仅 publish 页激活)。另有 `swipeAway`(盲滑走,直播卡)\| `skip`(不互动,广告评论)\| `back`(iOS 返回手势) |
| `ocr` | 可选 | 字符串正则(加载时 `new RegExp(pattern,'i')`)。**用途**:①系统窗 `deny/allow` 走 WDA alert 时按词表匹配按钮 ②VLM「疑似命中」时用 OCR 二次确认降幻觉(见总纲 §6 风险) |
| `region` | 可选 | 归一化 `[x,y,w,h]` 先验区域,缩小 VLM 搜索、降误判。**注意**:core 的 `Box` 是角点 `[x1,y1,x2,y2]`,插件加载时由 `targets.ts` 换算(坏数据 fail-fast) |
| `box` | 可选 | 归一化点 `[x,y]` 或框 `[x,y,w,h]`——**已实测的固定位置**,可作 VLM 失败时的兜底坐标 |
| `verified` | 可选 | `true` = 本会话真机截图实测过(坐标已核) |
| `stable` | 可选 | `true` = 位置极稳(底部导航等),**未来可提为「盲点」优化**(同盲滑,省一次 VLM),默认仍走 VLM |
| `source` / `notes` | 可选 | 出处与注意事项 |

## 激活规则 `activation`

- `globalHazards`:**每步都查**的危险(登录窗/权限窗/shop 广告/内嵌网页等,随时可能弹)。
- `pageHazards`:仅在某页查的危险(评论区才查广告评论;搜索页才查应用内位置推广)。运行时 = `globalHazards ∪ pageHazards[当前页]`。
- `pageExpected`:各页的「正常」判据(信息流要有 `feed.rail`)。

## 数据出处(可追溯)

| 来源 | 提炼出的 Target |
|---|---|
| 本会话真机实测(verified) | `sys.location-perm`(IMG_0008)、`ad.shop-promo`(IMG_0002)、`browser.inapp`(IMG_0007)、`search.result-2` |
| 旧 `popupDetect` SIGNATURES | login/notif/addyours/notif-friend/avatar/policy/notif-comment/security-check/passkey/location-inapp/sheet |
| 旧 `alertIntent` DENY/ALLOW | sys.tracking/notif-perm/fb-login/camera/mic/photo-perm |
| 旧 `isLivePage` / `isAdComment` | `feed.live-tag` / `comment.ad-first` |
| 旧 `anchors.ts` / 标定 | feed.*/nav.*/comments.*/profile.*/publish.*(坐标改由 VLM 定位,anchors 仅作 region 先验) |

## 关键设计点

1. **VLM 是坐标唯一源**:旧系统的 `closeAt` 固定坐标、`anchors` 死坐标 → 现在都是 `phrase`(VLM 定位)。`box`/`region` 只作先验/兜底,不是主路径。这消灭了「换机重标定」(iPhone 8 一份 region 通吃)。
2. **危险三类语义不同**:`system` 用 WDA alert;`overlay` 点它自己的关闭钮(不再猜右上角——旧系统误点 shop 的教训);`category` 不关而绕(直播划走、广告评论跳过)。
3. **`notes` 里的「勿点」是硬约束**:红「接收通知」/「继续」/「打开设置」/「Pick now」等危险按钮,phrase 从不指向它们,只指向安全出口。
4. **OCR 二次确认治幻觉**:grounding 模型可能对不存在的目标幻觉出框;带 `ocr` 的危险目标,VLM 命中后可用 OCR 核对文字再动手(总纲 §6 待验收)。

## 待办(G2 感知服务验收时补)

- 每个 `verified:false` 的 Target 真机核 `phrase` 定位准度(尤其小目标 ×,配合 §性能报告 512 精度地板)。
- `feed.live-tag` 修正后的 stream-video 用例复测。
- **publish 权限窗 allow 按钮的 VLM 定位实测**(中文「好」「允许访问所有照片」的 phrase 定位未验;deny 的「Don't Allow」已在 IMG_0008 验过)。命中后用 `ocr` 词表二次确认再点,防点错成「不允许」。
