# Target 注册表说明(G0)

配套数据文件:[`target-registry.json`](target-registry.json)。这是 autotk 2.0 **声明式感知**的单一数据源——所有「要识别什么、识别到怎么办」都在这张表里,不写死在代码。总纲见 [`../自动化框架-架构设计总纲.md`](../自动化框架-架构设计总纲.md) §5/§6。

## 它是什么

每个 **Target** 是一个可被感知层识别的对象。分两类:
- **hazard(危险)**:出现即需处理(广告/弹窗/权限窗/直播卡)。带 `handler`(怎么处理)。
- **expected(期望)**:证明「环境正确/可以做下一步」的屏幕特征(动作栏、输入框、按钮)。

决策函数先做**一次全屏 OCR 危险扫描**：用激活 hazards 的 `ocr` 特征匹配；命中后才单独 grounding 定位安全按钮。没有危险后，expected 按优先级逐个单查；**危险优先**处理，否则才执行期望动作。LocateAnything 是单目标模型，不存在组合查询。

## 字段

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | ✓ | 命名空间点分:`域.名`(如 `ad.shop-promo`、`feed.like`) |
| `kind` | ✓ | `hazard` \| `expected` |
| `phrase` | ✓ | **送 LocateAnything 的英文定位短语**(grounding query)。表达要具体、可定位 |
| `hazardClass` | hazard | `system`(iOS 系统窗)\| `overlay`(应用内浮层)\| `category`(不关而绕:直播/广告评论)。**决定优先级与 handler 语义** |
| `handler` | hazard | `deny` / `allow` / `tapBox`:**执行上都是「点 VLM 定位到的框中心」**(系统弹窗不走 WDA /alert——该通道对带地图的窗读不到,已弃,见 L0 规格书 §7;tap 点系统弹窗按钮已真机实证)。`deny/allow` 是**语义标签**:phrase 指向拒绝/允许按钮,供审计(养号工作流断言**绝不含 allow**;allow 仅 publish 页激活)。另有 `swipeAway`(盲滑走,直播卡)\| `skip`(不互动,广告评论)\| `back`(iOS 返回手势) |
| `ocr` | 页级危险应有 | 字符串正则(运行时 `new RegExp(pattern,'i')`)。一次全屏 OCR 用它判断危险是否在场；命中后再定位安全按钮。无 `ocr` 的危险退回逐个 grounding |
| `region` | 可选 | 归一化 `[x,y,w,h]` 先验区域,缩小 VLM 搜索、降误判。**注意**:core 的 `Box` 是角点 `[x1,y1,x2,y2]`,插件加载时由 `targets.ts` 换算(坏数据 fail-fast) |
| `box` | 可选 | 归一化点 `[x,y]` 或框 `[x,y,w,h]`——**已实测的固定位置**,可作 VLM 失败时的兜底坐标 |
| `verified` | 可选 | `true` = 本会话真机截图实测过(坐标已核) |
| `stable` | 可选 | `true` = 位置极稳(底部导航等),**未来可提为「盲点」优化**(同盲滑,省一次 VLM),默认仍走 VLM |
| `source` / `notes` | 可选 | 出处与注意事项 |

## 激活规则 `activation`

- `globalHazards`:**每步都激活**的页级危险(权限窗/shop 广告/内嵌网页等,随时可能弹)。
- `pageHazards`:仅在某页激活的遮挡危险。运行时 = `globalHazards ∪ pageHazards[当前页]`。
- `pageExpected`:各页的「正常」判据(信息流要有 `feed.rail`)。

`feed.live-tag`、`feed.ad-marker`、`comment.ad-first` 等内容分类不进页级危险，避免全屏字幕误匹配；由工作流显式定位后选择跳过/不互动。

## 数据出处(可追溯)

| 来源 | 提炼出的 Target |
|---|---|
| 真机实测(verified) | `sys.perm-deny`(IMG_0008 带地图定位窗 + 通用DontAllow-hazard.png 通讯录窗)、`ad.shop-promo`(IMG_0002)、`browser.inapp`(IMG_0007)、`search.result-2`、`publish.post-confirm`(添加Post-now.png)、`publish.next`/`publish.post` region(Next识别不准.png/添加Post-now.png) |
| 旧 `popupDetect` SIGNATURES | login/notif/addyours/notif-friend/avatar/policy/notif-comment/security-check/passkey/location-inapp/sheet |
| 旧 `alertIntent` DENY/ALLOW | sys.tracking/fb-login/camera/mic/photo-perm(原 location-perm/notif-perm 已并入通用 `sys.perm-deny`) |
| 通用危险(2026-07-20 加) | `sys.perm-deny`(通用 Don't Allow)、`popup.not-now`(通用 Not Now)、`popup.not-interested`(不感兴趣)、`popup.generic-close`(通用弹窗角落 × 兜底) |
| 旧 `isLivePage` / `isAdComment` | `feed.live-tag` / `comment.ad-first` |
| 旧 `anchors.ts` / 标定 | feed.*/nav.*/comments.*/profile.*/publish.*(坐标改由 VLM 定位,anchors 仅作 region 先验) |

## 关键设计点

1. **VLM 是坐标唯一源**:旧系统的 `closeAt` 固定坐标、`anchors` 死坐标 → 现在都是 `phrase`(VLM 定位)。`box`/`region` 只作先验/兜底,不是主路径。这消灭了「换机重标定」(iPhone 8 一份 region 通吃)。
2. **危险处理单一路径**:`system` 与 `overlay` 都走截图→OCR/grounding→W3C tap；不使用 WDA `/alert`。内容 `category` 由工作流判断后绕过。
3. **`notes` 里的「勿点」是硬约束**:红「接收通知」/「继续」/「打开设置」/「Pick now」等危险按钮,phrase 从不指向它们,只指向安全出口。
4. **OCR 先筛危险治幻觉**:grounding 模型可能对不存在的目标幻觉出框；页级危险先凭全屏真实文字判在场，命中后才定位并处理。

## 真机待验

- 每个 `verified:false` 的 Target 真机核 `phrase` 定位准度(尤其小目标 ×,配合 §性能报告 512 精度地板)。
- `feed.live-tag` 修正后的 stream-video 用例复测。
- **publish 权限窗 allow 按钮的 VLM 定位实测**(中文「好」「允许访问所有照片」的 phrase 定位未验;deny 的「Don't Allow」已在 IMG_0008 验过)。命中后用 `ocr` 词表二次确认再点,防点错成「不允许」。
