@echo off
chcp 65001 >nul
REM ============================================================
REM  把「激活WDA」GUI 打包成独立 exe（买家双击一个图标即可）。
REM  在一台 Windows 上运行本脚本一次，产出 dist\ActivateWDA.exe。
REM
REM  本机前置： 已装 Python 3.9+；本脚本会自动 pip install pyinstaller。
REM  ⚠️ 运行时仍需买家电脑上具备（见 README-激活WDA.md）：
REM     - pymobiledevice3： pip install -U pymobiledevice3
REM     - go-ios / 开发者镜像（挂 DDI 用）
REM     这两样本身依赖 Python/原生组件，无法塞进这个 exe——由卖家在买家电脑一次性配好。
REM ============================================================
cd /d "%~dp0"
python -m pip install --upgrade pyinstaller || goto :err
pyinstaller --onefile --windowed --uac-admin --name ActivateWDA wda_gui.py || goto :err
echo.
echo ✅ 完成。产物： %~dp0dist\ActivateWDA.exe
echo    把它拷到买家电脑桌面、重命名为「激活WDA」，右键属性可设为「以管理员身份运行」。
pause
exit /b 0
:err
echo.
echo ❌ 打包失败，看上面的报错。
pause
exit /b 1
