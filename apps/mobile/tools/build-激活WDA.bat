@echo off
chcp 65001 >nul
REM ============================================================
REM  把「激活WDA」打包成**完全自包含**的 exe：Python 解释器 + pymobiledevice3
REM  及其全部依赖都塞进 exe。买家电脑**什么都不用装**，双击即用。
REM
REM  在一台 Windows 上（装了 Python 3.9+）运行本脚本一次即可，产出 dist\ActivateWDA.exe。
REM  （pymobiledevice3 挂开发者镜像不需要 go-ios——go-ios 是装 WDA 用的，装机走装机台。）
REM ============================================================
cd /d "%~dp0"

echo [1/2] 安装打包依赖（pyinstaller + pymobiledevice3）…
python -m pip install --upgrade pyinstaller pymobiledevice3 || goto :err

echo.
echo [2/2] 打包（把 pymobiledevice3 及依赖整体收进 exe）…
REM --collect-all pymobiledevice3：连它的子模块 + 数据文件一起收（它动态导入很多服务类，必须 collect-all）。
REM --copy-metadata pymobiledevice3：它启动时会用 importlib.metadata 读自己的版本，缺了会报错。
REM 其余常见需一并 collect 的传递依赖也带上，避免冻结后 hidden import 缺失。
pyinstaller --onefile --windowed --uac-admin --name ActivateWDA ^
  --collect-all pymobiledevice3 ^
  --copy-metadata pymobiledevice3 ^
  --collect-all ipsw_parser ^
  --collect-all developer_disk_image ^
  --collect-submodules construct ^
  --collect-all zeroconf ^
  --collect-all ifaddr ^
  --hidden-import ctypes ^
  wda_gui.py || goto :err

echo.
echo ✅ 完成。产物： %~dp0dist\ActivateWDA.exe  （完全自包含，买家双击即用）
echo    首次务必自己在**没装 Python 的干净 Windows** 上双击测一次，确认能起、能检测到手机。
echo    ⚠️ 若冻结包运行时报某模块 ModuleNotFoundError，按提示再加一条 --collect-all ^<模块名^> 重打。
pause
exit /b 0
:err
echo.
echo ❌ 打包失败，看上面的报错。常见：pip 装 pymobiledevice3 失败（网络/编译），或缺 hidden import。
pause
exit /b 1
