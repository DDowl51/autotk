# WDA 手机独立运行(复刻 AScript-WDA)

目标:WDA 装在手机上,**点开就跑、拔线独立运行**,电脑只做一次性编译 + 每次开机激活(挂镜像)。

整体三段:

1. **一次性**:编译「自启动版」WDA → 得到一个 `wda.ipa`(需要 Mac 一次,或 GitHub Actions 云编译)。
2. **装一次**:把 IPA 装到手机(Windows 用 Sideloadly/AltStore,或 go-ios)。
3. **每次开机**:跑 `tools/activate_wda.py` 挂载开发者镜像 → 手机上点开 WDA → 拔线。

> 第 3 步就是 AScript 的 `active.exe`;第 1 步是 AScript 提前帮你打好、让你扫码下载的那个包。

---

## 第一段:一次性编译自启动版 WDA(Mac / Xcode)

### 1. 拿 WDA 源码(用新版,≥ 5.10,支持「引用设备本地 XCTest 框架」)

```bash
git clone https://github.com/appium/WebDriverAgent.git
cd WebDriverAgent
```

### 2. 编译 for testing(出 `.app`)

Xcode 打开 `WebDriverAgent.xcodeproj` → 选 `WebDriverAgentRunner` scheme →
Signing & Capabilities 里选你的 Team、改一个唯一 bundle id(记下,如 `com.yourname.WebDriverAgentRunner`)。然后命令行:

```bash
xcodebuild build-for-testing \
  -project WebDriverAgent.xcodeproj \
  -scheme WebDriverAgentRunner \
  -destination 'generic/platform=iOS' \
  -derivedDataPath ./build \
  DEVELOPMENT_TEAM=<你的TeamID> \
  PRODUCT_BUNDLE_IDENTIFIER=com.yourname.WebDriverAgentRunner
```

产物:`build/Build/Products/Debug-iphoneos/WebDriverAgentRunner-Runner.app`

### 3. ★ 自启动改造:删掉嵌入的 XCTest 框架并重签

> 原理:iOS 17 把 `testmanagerd` 服务改了名,**包里自带的 XCTest 框架会让 WDA 一启动就崩**。
> 删掉后,WDA 改用「手机本地的 XCTest 框架」(开发者镜像挂载后就有)——这才点得开、能独立跑。

```bash
cd build/Build/Products/Debug-iphoneos
APP=WebDriverAgentRunner-Runner.app

# 3.1 先把当前 entitlements 导出来(重签要用)
codesign -d --entitlements :ent.plist "$APP"

# 3.2 删掉所有 XCTest 相关框架
rm -rf "$APP/Frameworks/"XC*.framework
rm -rf "$APP/Frameworks/"Testing.framework        # 若存在
# 删完检查:Frameworks 里不应再有任何 XC** / Testing 开头的框架
ls "$APP/Frameworks/"

# 3.3 用你的开发者身份重签(IDENTITY 用 `security find-identity -p codesigning -v` 查)
IDENTITY="Apple Development: you@example.com (XXXXXXXXXX)"
codesign -f -s "$IDENTITY" --entitlements ent.plist --timestamp=none "$APP"

# 3.4 打包成 IPA
mkdir -p Payload && rm -rf Payload/* && cp -r "$APP" Payload/
zip -qr wda.ipa Payload
echo "得到:$(pwd)/wda.ipa"
```

> 这个 `wda.ipa` 就是你的「AScript-WDA」——自启动版。之后装机、激活、运行**全部不再需要 Mac**。
> 若 3.3 重签报权限/描述文件错,把完整报错发我,我给你对症命令。

### 没有 Mac?用 GitHub Actions 云编译

把上面 2–3 步写进一个 macOS runner 的 workflow,push 即自动产出 `wda.ipa` 工件下载。需要的话我直接给你这份 workflow,**一台 Mac 都不用买**。

---

## 第二段:把 IPA 装到手机(Windows,无 Mac)

任选其一(都用免费 Apple ID 即可,7 天有效;长期用见文末签名说明):

- **Sideloadly**(推荐,Windows 友好):拖入 `wda.ipa` → 填 Apple ID → Start。
- **AltStore / AltServer**(Windows)。
- **go-ios**:`ios install --path=wda.ipa`。

装好后手机上会出现 WebDriverAgentRunner 图标。第一次需到
设置 → 通用 → VPN与设备管理 → 信任你的开发者证书。
并开启 设置 → 隐私与安全性 → 开发者模式。

---

## 第三段:每次开机激活(Windows / Linux 通用)

```bash
pip install -U pymobiledevice3        # 一次性装依赖

# iOS 17+ 需要管理员/root:
#   Linux:  sudo python3 tools/activate_wda.py
#   Windows:以管理员身份开终端,再 python tools\activate_wda.py
sudo python3 tools/activate_wda.py
```

脚本做完「挂载开发者镜像」后会提示你:**在手机上点开 WDA → 出现两行英文 → 拔线**。
此后 WDA 在手机上独立跑,绑定 `0.0.0.0:8100`。

验证(点开 WDA 后,传手机局域网 IP):

```bash
python3 tools/activate_wda.py --wda-ip 192.168.3.79
# 或直接:curl http://192.168.3.79:8100/status
```

autotk 连法不变:`http://<手机IP>:8100`(电脑 `tools/` REPL 或手机端 App)。

---

## iOS 16 / 旧设备补充(如 iPhone 8 · iOS 16.7)

上面的流程是按 **iOS 17/18** 写的。iOS 16 更简单,几处关键不同:

### 1. ★ 不要删 XCTest 框架

第一段第 3 步(删 `Frameworks/XC*.framework` 再重签)是 **iOS 17 专属**的坑(iOS 17 把 testmanagerd 改名,自带框架会让 WDA 一启动就崩)。
**iOS 16 不存在这个问题 → 跳过第 3 步,用标准 build 直接打包/安装。**

### 2. 挂镜像:不用 tunnel、不用 sudo

iOS 16 用**经典开发者镜像**(静态 DDI),不需要 iOS 17 那套个性化镜像 + RemoteXPC tunnel。

> ⚠️ **iOS 16 千万别跑 `go-ios tunnel start`** —— 那是 iOS 17+ 专用,iOS 16 会报
> `manualPairingTunnelStart: unsupported iOS version`。tunnel 跟 iOS 16 无关。

挂镜像三选一:
```bash
# A) 本仓库脚本(已自动识别 iOS<17,跳过 tunnel、不用 sudo)
python3 tools/activate_wda.py

# B) go-ios(iOS<17 用 image auto,不要 tunnel)
go-ios image auto

# C) 最省事:手机连 Mac → Xcode → Window → Devices and Simulators,
#    等 "Preparing device" 跑完就自动挂好了。
```

### 3. 开发者模式

iOS 16 一样要:设置 → 隐私与安全性 → 开发者模式 → 开 → 重启;并在 设置 → 通用 → VPN与设备管理 信任你的开发者证书。

### 4. 先把 WDA 跑通(连线,iOS 16 没有 devicectl)

`devicectl` 是 iOS 17+ 才有的,iPhone 8 用不了。先用连线方式确认 WDA 通:

- **Xcode**(有 Mac 最省事,一条龙:签名+装+挂镜像+启动):选中 iPhone 8 → 跑 `WebDriverAgentRunner` 的 Test(Product → Test)→ WDA 装上并在 `:8100` 起来;或
- **go-ios**(先 `image auto` 挂好镜像、WDA 已安装):`go-ios runwda`(默认 bundle id;自定义了加 `--bundleid=...`)。iOS 16 的 runwda **不需要 tunnel**。

> 不管哪条,前提都是 **WDA 已经签名安装到手机上**(就是为什么前面那个 "no devices" 签名报错要先解决)。runwda / Test 只是启动已装好的 WDA。

跑起来后 `curl http://<手机IP>:8100/status` 应 ready。**先用连线模式验证:autotk 能连上 + 坐标标定对**(iPhone 8 是 4.7 寸,逻辑分辨率 **375×667**,和之前 390×844 不同 → 必须重新 `calibrate`)。

### 5. 独立运行(拔线)——iOS 16 与 iOS 17 不同,需在设备上验

iOS 17 靠「删 XCTest + `devicectl` detached 拉起」实现拔线独立跑;iOS 16 没有 devicectl,标准 runner「点图标」通常不会自启(黑屏秒退)。
**建议**:先按第 4 步连线跑通整套流程(这步就能开始用 autotk 调试/养号);独立运行(拔线)作为单独一步——**把你在手机上点开 WDA 的现象告诉我**(黑屏?闪退?出现两行英文?),我再给 iOS 16 对症的自启动方案。

> 小结:iOS 16 上手更快(免去删框架 + tunnel + sudo),但"拔线独立跑"这一环和 iOS 17 不一样,要单独搞。

---

## 签名有效期(产品化必读)

- **免费 Apple ID**:签名 7 天失效,到期 WDA 拉不起来,要重装重签。仅适合自测/演示。
- **付费开发者账号($99/年)**:签名 1 年有效。
- **企业证书**:可长期分发(AScript 走的就是这类)。要做成「客户装上长期能用」,这一环必须落实。

签名过期只影响「能不能启动 WDA」,不影响本套流程本身。

---

## 免费账号 · 今天就能装(用 Mac 跑 Sideloadly,不用等审核、不花钱)

> 适用:**还没付费账号、想现在先验证 WDA 能不能跑通**。
> 思路:**编译还是走云**(新 Xcode 编的装 iOS16 会崩,见文末),只是把「签名+安装」这步交给 **Sideloadly**——它用你的免费 Apple ID 自动现签一张 **7 天证书**,拖个 IPA 进去就装好。
> 代价:**7 天到期要重签重装**、一个免费 Apple ID 同时最多 3 个自签 App。只适合自测,不适合长期。

### 为什么免费账号不在 Linux 上签
免费 Apple ID **拿不到能脱机用的证书和描述文件**(开发者网站那套 Certificates/Profiles 是付费账号才开放的)。免费签名必须靠工具**实时用 Apple ID 登录、临时换签**——这类工具(Sideloadly / AltStore)只有 **Mac/Windows** 版,Linux 上没有。你有 Mac,所以走 Mac;**Mac 这里只做"签名+安装",不编译**,所以 Xcode 太新也没关系。

### 0. 先备好两样东西
1. **云编译产物 `WebDriverAgent.ipa`**:把 autotk 推到 GitHub → Actions 页跑 `编译 WDA` 工作流 → 运行结束在页面底部 Artifacts 下载 `WebDriverAgent-ipa`(解压得到 `WebDriverAgent.ipa`)。把它拷到 Mac 上。
2. **iPhone 8 用数据线插在 Mac 上**,手机解锁、点「信任此电脑」。

### 1. Mac 上装 Sideloadly
去 https://sideloadly.io 下 macOS 版,拖进「应用程序」打开。第一次打开被拦:右键图标 →「打开」即可。
(它会顺带装一个 Apple 的 USB 驱动组件,按提示同意。)

### 2. 登录免费 Apple ID
Sideloadly 顶部能看到插着的 iPhone 8。在「Apple account」里填**你的 Apple ID 邮箱**,点旁边登录、输密码(开了两步验证就再输一次验证码)。
> 用平时那个 Apple ID 就行,免费的也可以。它只用来现签,不会动你别的东西。

### 3. 拖 IPA → Start
把 `WebDriverAgent.ipa` 拖到 Sideloadly 中间的框里 → 点 **Start**。
它会自动:建一个临时 App ID → 现签 7 天证书 → 通过 USB 装进手机。进度走完提示 Done 即成功。
> 中途可能让你**再输一次 Apple ID 密码**,正常。

### 4. 手机上「信任」这个开发者
装好后手机桌面会多一个 WebDriverAgentRunner 图标,但**直接点会被拦**。先去:
**设置 → 通用 → VPN 与设备管理 →** 找到你的 Apple ID 那条「开发者 App」**→ 点「信任」**。
(这步不做,点开就闪退或弹「不受信任的开发者」。)

### 5. 确认真正的 bundle id(免费签名常被改名,关键!)
Sideloadly 给免费账号签时**可能把 bundle id 改掉**(比如加前缀)。后面 `runwda` 必须用**改后的真实 id**,否则起不来。在 Linux 上查:
```bash
go-ios apps --udid eb0c563dca21a2f9c20c14eda73b42453c75b4e7 | grep -i webdriver
```
记下它实际显示的那个 bundle id(下一步用 `<真实BUNDLEID>` 代替)。

### 6. 挂镜像 + 跑(在 Linux,拔掉 Mac 改插这台 Linux 也行;iOS16 别用 tunnel)
```bash
go-ios image auto                                  # 挂开发者镜像(iOS16 经典静态镜像,不要 tunnel)
go-ios runwda --bundleid=<真实BUNDLEID> \
  --testrunnerbundleid=<真实BUNDLEID> \
  --xctestconfig=WebDriverAgentRunner.xctest
curl http://<手机IP>:8100/status                   # 返回 ready 就成了
```
> 也可以直接在手机上**点 WebDriverAgentRunner 图标**把它拉起来(免费签的,7 天内有效)。
跑通后别忘了 **重新 `calibrate`**(iPhone 8 是 375×667)。

### 7 天后怎么办
证书到期 WDA 就拉不起来了。重做 **第 3 步**(Sideloadly 拖 IPA → Start)重签一次即可,手机上图标会原地更新,不用卸载。嫌烦就上付费账号(下一节,签一次管 1 年)。

---

## 付费账号 · Linux 签名安装一条龙(账号批下来后照这个做,全程不用 Mac)

> 适用:**付费开发者账号已激活** + 已有云编译产物 `WebDriverAgent.ipa`
> (bundle id `com.ddowl.WebDriverAgentRunner.xctrunner`) + iPhone 8 的 UDID
> `eb0c563dca21a2f9c20c14eda73b42453c75b4e7` + Linux 上有 `openssl`、`go-ios`。
>
> 新 Xcode 编不出兼容 iOS16 的 WDA,所以「编译」走云(`.github/workflows/build-wda.yml`,Xcode 14.3.1);「签名 + 安装」走 Linux。

### 1. 生成私钥 + CSR(Linux openssl)
```bash
openssl genrsa -out ios.key 2048
openssl req -new -key ios.key -out ios.csr -subj "/CN=ddowl iOS Dev/emailAddress=你的邮箱/C=CN"
```

### 2. developer.apple.com 建证书
Certificates, Identifiers & Profiles → **Certificates → ＋ → Apple Development** → 上传 `ios.csr` → 下载 `development.cer`。

### 3. .cer → .p12(Linux openssl)
```bash
openssl x509 -inform der -in development.cer -out development.pem
openssl pkcs12 -export -inkey ios.key -in development.pem -out cert.p12 -passout pass:你设的密码
```
> 记住这个密码,zsign 要用。

### 4. 注册设备
**Devices → ＋** → Platform iOS,名字随便,UDID 填:
`eb0c563dca21a2f9c20c14eda73b42453c75b4e7`

### 5. 建标识符(用通配符,省去 bundle id 对不上的麻烦)
**Identifiers → ＋ → App IDs → App → Wildcard** → Bundle ID 填 `com.ddowl.*` → 注册。
(云编译产物是 `com.ddowl.WebDriverAgentRunner.xctrunner`,被 `com.ddowl.*` 覆盖。)

### 6. 建描述文件
**Profiles → ＋ → iOS App Development** → App ID 选 `com.ddowl.*` → 证书选第 2 步那个 → 设备勾 iPhone 8 → 生成 → 下载 `dev.mobileprovision`。

### 7. Linux 装 zsign
Arch:`yay -S zsign`(AUR);或源码:
```bash
sudo pacman -S --needed git gcc openssl      # apt: g++ git libssl-dev
git clone https://github.com/zhlynn/zsign.git && cd zsign
# 按仓库 README 编译(通常 bash build.sh 或 cmake),产物是 zsign 可执行文件
```

### 8. 签名
```bash
zsign -k cert.p12 -p "你设的密码" -m dev.mobileprovision \
  -o WebDriverAgent-signed.ipa  WebDriverAgent.ipa
```

### 9. 安装(go-ios,Linux)
```bash
go-ios install --path=WebDriverAgent-signed.ipa \
  --udid eb0c563dca21a2f9c20c14eda73b42453c75b4e7
```

### 10. 挂镜像 + 跑(iOS16 别用 tunnel)
```bash
go-ios image auto
go-ios runwda --bundleid=com.ddowl.WebDriverAgentRunner.xctrunner \
  --testrunnerbundleid=com.ddowl.WebDriverAgentRunner.xctrunner \
  --xctestconfig=WebDriverAgentRunner.xctest
# 或：手机上点开 WDA 图标独立跑（付费证书签的，1 年有效）
curl http://<手机IP>:8100/status        # ready 即成功
```
跑通后别忘了 **重新 `calibrate`**(iPhone 8 是 375×667)。

### 备选:直接在 Action 里签好
把 `cert.p12`(base64)、p12 密码、`dev.mobileprovision` 设成 GitHub **Secrets**,可改 workflow 让 macOS runner 直接签好,产出**下载即可装**的签名 IPA。需要就说,我给带签名的 workflow。

> ⚠️ 另:**用新 Xcode(26)编 WDA 装到 iOS16 会崩**——`Symbol not found: _OBJC_CLASS_$_XCTCommandLineToolHelper`(新 XCTest 的类,iOS16 镜像里没有)。所以必须用 Xcode 14.3.1(本仓库云编译 workflow 已锁定该版本)。
