@echo off
chcp 65001 >nul
REM Launch the ActivateWDA GUI using the local Python (for dev, or when
REM not packaged as an exe). Requires Python + pymobiledevice3 installed.
REM iOS 17+ activation needs admin: right-click this file -> Run as
REM administrator, or use the "run as admin" button inside the GUI.
REM Usage notes (Chinese): see README-*.md in this folder.
cd /d "%~dp0"
start "" pythonw wda_gui.py
