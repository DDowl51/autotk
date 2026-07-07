@echo off
chcp 65001 >nul
REM 不打包 exe 时的启动方式：直接用 Python 跑「激活WDA」GUI。
REM 前置：买家电脑已装 Python + pymobiledevice3 + go-ios（见 README-激活WDA.md）。
REM iOS 17+ 激活需管理员：建议右键本文件→「以管理员身份运行」，或在 GUI 里点「以管理员身份重开」。
cd /d "%~dp0"
start "" pythonw wda_gui.py
