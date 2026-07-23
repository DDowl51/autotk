# 工作流测试记录与问题反馈清单

> 配套操作手册：[`真机部署手册.md`](真机部署手册.md)。
> 每次测试复制一份本文件填写。目标不是只写“失败了”，而是让另一个人拿到材料后能直接定位或复现。

---

## 1. 本次测试信息

```text
测试编号：
测试人：
开始时间：
结束时间：
git commit（git rev-parse --short HEAD）：
desktop 版本：

部署拓扑（二选一）：
[ ] desktop 托管 master
[ ] 手动 master（desktop 已设 MASTER_AUTOSTART=0 或未打开）

GPU / 显存：
GPU OS：
perception max-side / temperature：
Node / pnpm：
Python / torch：

设备名 / deviceId：
iPhone 型号：
iOS：
TikTok 版本：
go-ios 版本：
WDA ref / commit：
WDA bundleId：
手机逻辑分辨率：
```

---

## 2. 测试前门禁

### 2.1 离线门禁

- [ ] `pnpm --filter "@auto/*" test`
- [ ] `pnpm --filter @mc/master test`
- [ ] `pnpm --filter @mc/desktop test`
- [ ] `pnpm --filter "@auto/*" typecheck`
- [ ] `pnpm --filter @mc/master typecheck`
- [ ] `pnpm --filter @mc/desktop typecheck`

### 2.2 服务与手机

- [ ] 控制电脑访问 `http://<GPU_IP>:8000/health`，`ok=true`
- [ ] 控制电脑访问 `http://<PHONE_IP>:8100/status`
- [ ] TikTok 已登录测试账号、前台、未锁屏
- [ ] desktop 设置页 VLM 地址正确
- [ ] desktop 设置页扫描网段正确
- [ ] master 运行中
- [ ] 发现手机数正确
- [ ] 上线手机数正确
- [ ] 最近一次错误为“无”
- [ ] 没有第二份 master
- [ ] 评论真实发送关闭：`postReplies=false`
- [ ] 私信关闭：`dmEnable=false`

---

## 3. 冒烟

### 3.1 只定位

```text
TARGET：
命中：[ ] 是 [ ] 否
smoke-shot 中心是否压在目标：[ ] 是 [ ] 否
耗时：
备注：
```

### 3.2 真点（测试账号）

```text
TAP=1：[ ] 已明确启用
手机是否真实变化：[ ] 是 [ ] 否
下一帧是否能验证变化：[ ] 是 [ ] 否
备注：
```

### 3.3 640 精度

- [ ] `feed.like-off`
- [ ] `feed.save-off`
- [ ] `nav.search-icon`
- [ ] `comments.input`
- [ ] `ad.shop-promo`
- [ ] `browser.inapp`
- [ ] 实际出现的系统权限按钮
- [ ] 小目标失败后已用 768 对照

---

## 4. 单次工作流

```text
命令：
工作流：[ ] search [ ] followMonitor [ ] profileAndDM
配置文件（不要把原文件发出）：
产物目录：
退出码：
```

### 4.1 search

- [ ] `searchKeywords` 非空
- [ ] 回到推荐流/基准页
- [ ] 打开搜索
- [ ] 输入并提交关键词
- [ ] 进入合格结果
- [ ] 广告/直播被跳过
- [ ] 互动只作用于未点赞/未收藏目标
- [ ] 正常结束

### 4.2 followMonitor

- [ ] `following.moduleEnable=true`
- [ ] 测试账号已有关注内容
- [ ] 切到关注流
- [ ] 逐条处理
- [ ] 直播卡不互动
- [ ] 评论区读取/互动符合安全配置
- [ ] 回到推荐流
- [ ] 正常结束

### 4.3 profileAndDM

- [ ] `persHome.moduleEnable=true`
- [ ] 进入自己的主页
- [ ] 打开作品
- [ ] 读取评论
- [ ] 评论互动符合安全配置
- [ ] 第一轮 `dmEnable=false`
- [ ] 若验私信，仅对自有测试账号且 `dmDailyCap=1`
- [ ] 记录按钮不存在/平台拦截/成功的真实结果
- [ ] 正常结束

### 4.4 发布

- [ ] receiver 的 master 地址指向实际 master 主机 `:4610`
- [ ] receiver ID 等于 master deviceId
- [ ] receiver 显示已连接
- [ ] 相册/始终定位/本地网络权限已给
- [ ] desktop 扫描到目标视频
- [ ] receiver 下载中
- [ ] receiver 已存相册
- [ ] TikTok UI 发布完成
- [ ] desktop 终态 `published`
- [ ] 再次扫描不会重复发布

---

## 5. 结果

```text
最终结论：
[ ] 通过
[ ] 有条件通过
[ ] 失败
[ ] 因环境阻塞未执行

通过了什么：

没有通过什么：

自动化门禁与真机边界：

下一步：
```

---

## 6. 单个问题反馈模板

```text
标题：<工作流>/<设备>/<步骤> - <一句话现象>

测试编号：
发生时间（精确到分钟）：
是否稳定复现：[ ] 每次 [ ] 偶发 [ ] 仅一次

设备名 / deviceId：
工作流：
最后成功步骤：

前置状态：
1.
2.

最短复现步骤：
1.
2.
3.

期望结果：

实际结果：

手机当时停留页面：

错误原文（不要只写“报错”）：

已尝试的动作：

附件：
[ ] summary.json
[ ] events.jsonl
[ ] run.log
[ ] before.png
[ ] after.png
[ ] failure.png
[ ] desktop 当日 app 日志
[ ] desktop 后台状态截图
[ ] 手机原生截图/录屏
[ ] perception 日志
[ ] perception-environment.txt
[ ] WDA/runwda 日志

脱敏完成：
[ ] 配置文件未直接发送
[ ] UDID 只留末 4 位
[ ] IP 已替换
[ ] 搜索词/用户名/私信/评论/文案已替换
[ ] Apple 凭据、签名文件、视频未发送
```

---

## 7. 失败现场处理顺序

1. 暂停**单台**设备；
2. 不要立刻重启 master；
3. 记录时间、工作流、最后成功步骤；
4. 手机截图或录屏；
5. 截 desktop 后台状态与最近错误；
6. 保存 runner 产物或复制 desktop 当日日志；
7. 手动进程日志一并保存；
8. 填上面的单问题模板；
9. 完成留证后才重启后台；
10. 只改一个变量后复测，避免同时改 phrase、分辨率、网络与参数。
