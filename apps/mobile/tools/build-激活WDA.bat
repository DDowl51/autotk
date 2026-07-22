@echo off
chcp 65001 >nul
REM ============================================================
REM  Build "ActivateWDA" into a fully self-contained exe.
REM  Bundles Python + pymobiledevice3 + all deps, so the buyer's
REM  PC needs NOTHING installed. Run once on a Windows box with
REM  Python 3.9+.  Output: dist\ActivateWDA.exe
REM  (Activation uses pymobiledevice3, NOT go-ios.)
REM  Usage notes (Chinese): see README-*.md in this folder.
REM ============================================================
cd /d "%~dp0"

echo [1/2] Installing build deps (pyinstaller + pymobiledevice3)...
python -m pip install --upgrade pyinstaller pymobiledevice3
if errorlevel 1 goto :err

echo.
echo [2/2] Packaging (bundling pymobiledevice3 + deps into the exe)...
pyinstaller --onefile --windowed --uac-admin --name ActivateWDA ^
  --collect-all pymobiledevice3 ^
  --recursive-copy-metadata pymobiledevice3 ^
  --collect-all ipsw_parser ^
  --collect-all developer_disk_image ^
  --collect-submodules construct ^
  --collect-all zeroconf ^
  --collect-all ifaddr ^
  --hidden-import ctypes ^
  wda_gui.py
if errorlevel 1 goto :err

echo.
echo [OK] Done. Output file: %~dp0dist\ActivateWDA.exe
echo      Test it once on a clean Windows PC without Python.
echo      If it fails at runtime with ModuleNotFoundError NAME,
echo      add a "collect-all NAME" flag above and rebuild.
pause
exit /b 0

:err
echo.
echo [FAILED] See the error above.
echo   Common causes: pip install of pymobiledevice3 failed (network),
echo   or a missing hidden import (add --collect-all NAME and rebuild).
pause
exit /b 1
