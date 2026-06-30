# TikTok 国际版 - 推荐页(For You)元素映射

来源:真机抓取的 accessibility tree(iPhone 逻辑分辨率 390×844,bundleId `com.zhiliaoapp.musically`)。

> 关键点:推荐流是一个 `XCUIElementTypeTable`(name=`TTKFeedTableViewService`),
> 里面有多个 `feedcells`,但**只有当前播放的那一格 `visible="true"`**,其余在屏幕外
> 的格子里同名按钮 `visible="false"`。因此所有「当前视频」的按钮定位**必须加
> `visible == 1`**,否则会命中屏幕外的隐藏元素。

## 顶部导航
| 作用 | 定位 |
|---|---|
| For You 标签 | name == `top_tabs_recomend`(选中时 value=="1") |
| Following | name == `following` |
| Explore | name == `exploretab_tabname_explore` |
| Shop | name == `ecom_shop_tab_name` |
| 搜索(右上放大镜) | name == `Search` |

## 底部 Tab Bar
| 作用 | 定位 |
|---|---|
| 首页 | name == `a11y_vo_home` |
| 好友 | name == `friends` |
| 发布 | name == `Create` |
| 收件箱 | name == `a11y_vo_inbox` |
| 个人主页 | name == `a11y_vo_profile` |

## 当前视频右侧操作栏(均需 `visible == 1`)
| 作用 | 定位 | 备注 |
|---|---|---|
| 点赞 | name == `feedLikeButton` | label 形如 "Like video. N likes";已赞时 label 变化,据此判断避免重复点赞 |
| 评论(打开评论区) | name == `feedCommentButton` | label "Read or add comments. N comments" |
| 收藏 | name == `feedFavoriteButton` | label "Add to Favorites. ...";已收藏时 label 变化 |
| 分享 | name == `feedShareButton` | |
| 关注作者 | name BEGINSWITH `Follow ` | 已关注后该按钮消失(找不到即视为已关注) |
| 作者头像 | name BEGINSWITH `@` | |
| 音乐/原声 | name BEGINSWITH `Sound ` | |
| TikTok Tako(AI) | name == `tikBotButton` | 不使用 |

## 视频文案(用于正/反向提示词匹配)
当前视频文案是一个 `XCUIElementTypeOther`,特征:`visible="true" accessible="true"`,
name 即文案全文(含 #标签)。在可见元素里取 name 最长的那个 Other 即为文案。
predicate 兜底:`type == 'XCUIElementTypeOther' AND visible == 1 AND accessible == 1`。

## 切换下一个视频
推荐流全屏上滑:从屏幕下方中部滑到上方中部(约 (195,600)→(195,220),0.3s)。

## 已知特殊状态
- 视频不可用:StaticText `Video isn't available` / `Video isn’t available`。
- 录屏限制提示:StaticText `Screen recording is not allowed on Series`。
- 这些可作为「跳过当前视频」的信号。

## 待补充(需要对应界面的元素树)
- 评论区:评论列表项、单条评论点赞、回复输入框与发送按钮、关闭按钮。
- 搜索页:搜索框、搜索结果项。
- 个人主页:作品宫格项。
