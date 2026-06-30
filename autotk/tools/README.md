# 电脑驱动调试台（wda-cli）

在 Linux 上运行，连手机 WDA 操控 TikTok。控制进程在电脑上不会被挂起，
适合开发期连续运行与选择器迭代。手机与电脑需在同一 WiFi。

## 准备
1. 手机上启动 WDA + TikTok，确保 WDA 监听 8100。
2. 查到手机局域网 IP（手机设置 → WiFi → 当前网络详情，或 WDA 启动时屏幕上的两行字里有 IP）。
3. 电脑上先确认能连通：浏览器或 curl 访问 `http://<手机IP>:8100/status` 应返回 JSON。

## 用法
```bash
# 每条命令都需要 WDA_URL（手机 IP）
WDA_URL=http://192.168.x.x:8100 npm run wda -- <命令> [参数]
```

常用命令：
| 命令 | 作用 |
|---|---|
| `status` | 查询 WDA 状态（先验证连通） |
| `probe [文件名]` | 抓当前界面元素树 → `adaptation/element-trees/` |
| `shot [文件名]` | 截图 → `adaptation/screenshots/` |
| `foryou` | 切到推荐页 |
| `caption` | 读取当前视频文案 |
| `like` / `save` / `follow` | 当前视频点赞 / 收藏 / 关注 |
| `comment` | 打开评论区 |
| `swipe` | 上滑下一个 |
| `run [params.json]` | 连续运行引擎（默认仅推荐页养号；Ctrl+C 停止） |

示例：
```bash
# 验证连通
WDA_URL=http://192.168.1.20:8100 npm run wda -- status
# 单步验证点赞
WDA_URL=http://192.168.1.20:8100 npm run wda -- like
# 连续跑（默认安全养号配置：推荐页 看/赞/藏/关注 + 评论点赞）
WDA_URL=http://192.168.1.20:8100 npm run wda -- run
# 用原版参数跑（搜索拉粉/营销）
WDA_URL=http://192.168.1.20:8100 npm run wda -- run tools/params.example.json
```

## 用原版「小明同学」参数

`run [params.json]` 直接吃**原版那套扁平 JSON 参数**（`search_kw` / `for_you_video_int_prob` / `task_plan1_starttime` …）。
把原版参数辅助工具导出的参数存成一个 `.json` 文件传进去即可。注意：

- 布尔值要用 JSON 的 `true`/`false`（不是 Python 的 `True`/`False`）。
- `tools/params.example.json` 是一份可直接改用的样例（文档里的 bikini 养号配置）。
- 时间窗是设备本地时间、各段不重叠、按先后排列；想全天跑就让各段首尾相接。
- 关键参数映射：`for_you_video_like_prob`→推荐页点赞概率，`*_follow_prob`→关注概率，
  `*_comment_click_like_count`→单视频评论点赞上限，`*_comment_reply_count`→回复上限（设 0 不发回复），
  `kw_search_int_exec_prop`→搜索互动占比（>0 才会跑搜索拉粉，需要 `search_kw`）。

> 抓元素树用 `probe` 比在手机上复制粘贴方便得多：手机停在目标界面 → 电脑跑 `probe 名字.xml` → 文件直接落到 `adaptation/element-trees/`。
