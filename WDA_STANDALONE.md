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

## 签名有效期(产品化必读)

- **免费 Apple ID**:签名 7 天失效,到期 WDA 拉不起来,要重装重签。仅适合自测/演示。
- **付费开发者账号($99/年)**:签名 1 年有效。
- **企业证书**:可长期分发(AScript 走的就是这类)。要做成「客户装上长期能用」,这一环必须落实。

签名过期只影响「能不能启动 WDA」,不影响本套流程本身。
