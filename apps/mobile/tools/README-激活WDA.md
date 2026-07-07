# 「激活WDA」工具（给买家的手机重启恢复工具）

手机每次重启后，WDA 需要重新「激活」（挂载开发者镜像 DDI）一次，autotk 才能连上。
这个工具把命令行流程包成买家可**双击**的图形界面：连手机 → 点一个按钮 → 按提示在手机上点开 WDA。

## 组成

| 文件 | 作用 |
|---|---|
| `activate_wda.py` | 核心逻辑（挂 DDI，CLI + GUI 共用）。可单独命令行跑：`python activate_wda.py` |
| `wda_gui.py` | tkinter 图形界面，复用 activate_wda |
| `激活WDA.bat` | 用本机 Python 直接启动 GUI（`pythonw wda_gui.py`） |
| `build-激活WDA.bat` | 用 PyInstaller 打成独立 `ActivateWDA.exe`（买家看到一个干净图标） |

## 前置（卖家在**买家电脑**上一次性配好）

WDA 激活底层依赖两样，它们本身需要 Python/原生组件，**无法塞进 exe**：

1. **Python 3.9+**（装了后勾选 Add to PATH）。
2. **pymobiledevice3**：`pip install -U pymobiledevice3`（挂 DDI + iOS17 隧道）。
3. **go-ios**（可选，若走 go-ios 路线）+ 手机侧：设置→隐私与安全性→**开发者模式**打开。
4. iOS 17+ 激活需**管理员权限**（工具会提示/可一键以管理员重开）。

> 这些正是 `WDA_STANDALONE.md` 第三段描述的环境。装好后，本工具只是它的图形外壳。

## 交付方式（二选一）

- **打成 exe（推荐，买家最省心）**：在一台装了 Python 的 Windows 上运行 `build-激活WDA.bat`
  → 得到 `dist\ActivateWDA.exe` → 拷到买家桌面、重命名「激活WDA」、属性里设「以管理员身份运行」。
  （买家电脑仍需装 pymobiledevice3；exe 只免去买家看到 Python 脚本。）
- **直接给脚本**：把本目录的 `activate_wda.py` / `wda_gui.py` / `激活WDA.bat` 拷到买家桌面某文件夹，
  买家右键 `激活WDA.bat`→以管理员身份运行。

## 买家怎么用

1. 手机重启后，用数据线连电脑，手机解锁、点「信任此电脑」。
2. 双击「激活WDA」。
3. 点「① 激活手机 WDA」，等它显示「✅ 激活成功」。
4. 按提示在手机上点开 WDA 图标（出现两行英文即成功），拔线。
5. 打开 autotk 点「启动」。

失败时看窗口里日志的红色 ❌ 提示（多为：没装 pymobiledevice3 / 不是管理员 / 开发者模式没开 / 没插稳）。
