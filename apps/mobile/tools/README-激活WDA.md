# 「激活WDA」工具（给买家的手机重启恢复工具）

手机每次重启后，WDA 需要重新「激活」（挂载开发者镜像 DDI）一次，autotk 才能连上。
本工具打包成**完全自包含的 exe**：Python 解释器 + pymobiledevice3 及全部依赖都在 exe 里，
**买家电脑什么都不用装，双击即用**。

## 组成

| 文件 | 作用 |
|---|---|
| `activate_wda.py` | 核心逻辑（挂 DDI）。支持「冻结 exe 内自调用 pymobiledevice3」，无需外部 CLI |
| `wda_gui.py` | tkinter 图形界面，复用 activate_wda |
| `build-激活WDA.bat` | 一键 PyInstaller 打成自包含 `ActivateWDA.exe` |
| `激活WDA.bat` | 未打包时直接用本机 Python 跑（开发/调试用） |

## 卖家：打一次 exe（在一台有 Python 的 Windows 上）

```bat
:: 双击 build-激活WDA.bat  —— 它会自动 pip install pyinstaller+pymobiledevice3，再打包
:: 产物：dist\ActivateWDA.exe
```

- **不需要 go-ios**：挂开发者镜像用的是 pymobiledevice3；go-ios 是「装 WDA」用的，装机走装机台。
- 打完**务必在一台没装 Python 的干净 Windows 上双击测一次**，确认能起、能检测到手机
  （PyInstaller 冻结 pymobiledevice3 偶尔会缺 hidden import，报 `ModuleNotFoundError: xxx` 就在
  bat 里加一条 `--collect-all xxx` 重打）。

## 买家：怎么用（零安装）

1. 手机重启后，用数据线连电脑，手机解锁、点「信任此电脑」；确保手机
   设置→隐私与安全性→**开发者模式**已开。
2. 双击「激活WDA」（`ActivateWDA.exe`，会自动弹 UAC 请求管理员——点「是」）。
3. 点「①  激活手机 WDA」，等显示「✅ 激活成功」。
4. 按提示在手机上点开 WDA 图标（出现两行英文即成功），拔线。
5. 打开 autotk 点「启动」。

失败时看窗口里日志的红色 ❌ 提示（多为：不是管理员 / 开发者模式没开 / 没插稳 / 没点信任）。

> 交付时把 `ActivateWDA.exe` 拷到买家桌面、重命名「激活WDA」即可。买家电脑**无需 Python、无需 pip、无需 go-ios**。
