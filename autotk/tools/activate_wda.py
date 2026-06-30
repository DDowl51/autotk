#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
activate_wda.py — 激活 WDA(挂载开发者镜像 DDI),Windows / Linux 通用。

等价于 AScript 的 active.exe:
  手机每次重启后跑一次本脚本 → 然后在手机上「点开」自启动版 WDA → WDA 在手机上独立运行,
  电脑可拔线。（DDI 一旦挂载,直到手机重启前都有效；tap 启动用的是手机本地 XCTest 框架,不需要电脑。）

后端:pymobiledevice3(纯 Python,跨平台)。
  安装:  pip install -U pymobiledevice3
  iOS 17+ 需要一条 RemoteXPC 隧道(tunnel)才能挂载,隧道需要管理员/root 权限。

用法:
  # 先自检(不连设备也能跑,确认环境就绪)
  python3 activate_wda.py --check

  # 正式激活(连上手机,iOS 17+ 需要管理员/root)
  #   Linux:  sudo python3 activate_wda.py
  #   Windows:以管理员身份打开终端,再 python activate_wda.py
  python3 activate_wda.py

  # 激活后想顺便验证 WDA 是否真起来了(点开 WDA 后,传手机局域网 IP)
  python3 activate_wda.py --wda-ip 192.168.3.79

说明:本脚本只负责「激活(挂 DDI)」这一步——和 AScript 的 active.exe 一样。
启动 WDA 由你在手机上点图标完成(前提是装的是自启动版 WDA,见 WDA_STANDALONE.md)。
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import shutil
import subprocess
import sys
import time
import urllib.request

PMD = "pymobiledevice3"
TUNNELD_API = "http://127.0.0.1:49151"  # pymobiledevice3 remote tunneld 默认监听端口
IS_WINDOWS = os.name == "nt"


# ----------------------------- 小工具 -----------------------------

def info(msg: str) -> None:
    print(f"  {msg}")


def step(msg: str) -> None:
    print(f"\n▶ {msg}")


def ok(msg: str) -> None:
    print(f"✅ {msg}")


def err(msg: str) -> None:
    print(f"❌ {msg}", file=sys.stderr)


def run(args: list[str], capture: bool = True, timeout: int | None = 120) -> subprocess.CompletedProcess:
    """跑一条命令,返回 CompletedProcess。capture=True 时收集 stdout/stderr。"""
    return subprocess.run(
        args,
        capture_output=capture,
        text=True,
        timeout=timeout,
    )


def is_admin() -> bool:
    """当前是否有管理员/root 权限(iOS 17+ 起隧道需要)。"""
    if IS_WINDOWS:
        try:
            import ctypes  # noqa: WPS433
            return bool(ctypes.windll.shell32.IsUserAnAdmin())
        except Exception:
            return False
    return hasattr(os, "geteuid") and os.geteuid() == 0


def elevate_hint() -> str:
    return (
        "请以管理员身份重跑:Windows 用『以管理员身份运行』的终端;"
        "Linux 用 `sudo python3 activate_wda.py`。"
    )


# ----------------------------- 各步骤 -----------------------------

def check_pmd() -> bool:
    """确认 pymobiledevice3 已安装且可调用。"""
    if shutil.which(PMD) is None:
        err(f"未找到 {PMD}。请先安装:  pip install -U {PMD}")
        return False
    try:
        cp = run([PMD, "version"])
        ver = (cp.stdout or cp.stderr).strip().splitlines()[0] if (cp.stdout or cp.stderr) else "?"
        ok(f"{PMD} 已安装(version: {ver})")
        return True
    except Exception as e:  # noqa: BLE001
        err(f"{PMD} 调用失败:{e}")
        return False


def list_device() -> dict | None:
    """取第一台通过 USB 连接的设备信息(含 ProductVersion / UDID)。"""
    try:
        cp = run([PMD, "usbmux", "list"])
    except Exception as e:  # noqa: BLE001
        err(f"列设备失败:{e}")
        return None
    raw = (cp.stdout or "").strip()
    if not raw:
        err("没有检测到通过 USB 连接的设备。检查:数据线、手机解锁、已点『信任此电脑』。")
        if cp.stderr.strip():
            info(cp.stderr.strip())
        return None
    try:
        devices = json.loads(raw)
    except json.JSONDecodeError:
        # 某些版本默认输出非 JSON——把原文打出来供排查。
        err("无法解析设备列表(pymobiledevice3 输出格式可能变了),原始输出:")
        print(raw)
        return None
    if not devices:
        err("设备列表为空。")
        return None
    dev = devices[0]
    name = dev.get("DeviceName") or dev.get("Name") or "iPhone"
    ver = dev.get("ProductVersion") or "?"
    udid = dev.get("Identifier") or dev.get("UniqueDeviceID") or "?"
    ok(f"设备:{name} · iOS {ver} · UDID {udid}")
    return {"name": name, "version": ver, "udid": udid}


def ios_major(version: str) -> int:
    try:
        return int(version.split(".")[0])
    except Exception:  # noqa: BLE001
        return 0


def tunneld_running() -> bool:
    """检测是否已有 pymobiledevice3 remote tunneld 在跑。"""
    try:
        with urllib.request.urlopen(TUNNELD_API, timeout=2) as resp:
            return resp.status == 200
    except Exception:  # noqa: BLE001
        return False


def start_tunneld() -> subprocess.Popen | None:
    """在后台起一条 RemoteXPC 隧道(需要管理员/root)。返回进程句柄以便收尾。"""
    if tunneld_running():
        ok("检测到已有 tunnel 在运行,复用之。")
        return None
    if not is_admin():
        err("iOS 17+ 挂载需要 tunnel,而 tunnel 需要管理员/root 权限。")
        info(elevate_hint())
        info("或在另一个管理员终端先手动执行:  sudo " + PMD + " remote tunneld")
        return None
    step("启动 RemoteXPC 隧道(remote tunneld)…")
    # 后台常驻,直到本脚本结束再关掉。
    proc = subprocess.Popen(
        [PMD, "remote", "tunneld"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    # 等隧道就绪(最多 ~25 秒)。
    for _ in range(25):
        if tunneld_running():
            ok("tunnel 已就绪。")
            return proc
        if proc.poll() is not None:
            err("tunnel 进程意外退出。请手动跑 `sudo pymobiledevice3 remote tunneld` 看报错。")
            return None
        time.sleep(1)
    err("等待 tunnel 就绪超时。")
    proc.terminate()
    return None


def auto_mount() -> bool:
    """挂载开发者镜像(DDI)。iOS≥17 会用 personalized image(自动从 Apple 下载)。"""
    step("挂载开发者镜像(DDI)…")
    try:
        cp = run([PMD, "mounter", "auto-mount"], timeout=300)
    except Exception as e:  # noqa: BLE001
        err(f"挂载命令执行失败:{e}")
        return False
    out = (cp.stdout or "") + (cp.stderr or "")
    text = out.strip()
    # 已挂载也算成功(pymobiledevice3 会提示 already mounted)。
    if cp.returncode == 0 or "already" in text.lower() or "mounted" in text.lower():
        ok("开发者镜像已挂载。")
        if text:
            info(text.splitlines()[-1])
        return True
    err("挂载失败,输出如下:")
    print(text)
    info("常见原因:① 未起 tunnel(iOS17+);② 开发者模式没开"
         "(设置→隐私与安全性→开发者模式);③ pymobiledevice3 版本旧,`pip install -U pymobiledevice3`。")
    return False


def verify_wda(ip: str, timeout: int = 40) -> bool:
    """轮询 http://<ip>:8100/status 确认 WDA 已在手机上跑起来。"""
    url = f"http://{ip}:8100/status"
    step(f"验证 WDA:{url}（请确认你已在手机上点开 WDA）…")
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=3) as resp:
                body = resp.read().decode("utf-8", "ignore")
                data = json.loads(body)
                state = data.get("value", {}).get("state") or data.get("state")
                ok(f"WDA 在线!state={state}")
                return True
        except Exception:  # noqa: BLE001
            time.sleep(2)
    err("超时未连上 WDA。确认:手机上点开了自启动版 WDA、手机和本机同一 WiFi、IP 正确、8100 未被防火墙拦。")
    return False


# ----------------------------- 主流程 -----------------------------

def main() -> int:
    parser = argparse.ArgumentParser(description="激活 WDA(挂载开发者镜像),Windows/Linux 通用。")
    parser.add_argument("--check", action="store_true", help="只做环境自检,不连设备、不挂载。")
    parser.add_argument("--wda-ip", metavar="IP", help="激活后轮询此 IP 的 8100 端口验证 WDA。")
    parser.add_argument("--keep-tunnel", action="store_true", help="结束后不关闭本脚本起的 tunnel。")
    args = parser.parse_args()

    print("=" * 56)
    print(f" 激活 WDA · {platform.system()} {platform.release()} · py{platform.python_version()}")
    print(f" 管理员/root 权限:{'是' if is_admin() else '否'}")
    print("=" * 56)

    step("检查 pymobiledevice3")
    if not check_pmd():
        return 2

    if args.check:
        ok("自检完成。连上手机后去掉 --check 即可正式激活。")
        if not is_admin():
            info("提示:iOS 17+ 正式激活时需要管理员/root。" + elevate_hint())
        return 0

    step("检测设备")
    dev = list_device()
    if dev is None:
        return 3

    tunnel_proc: subprocess.Popen | None = None
    try:
        if ios_major(dev["version"]) >= 17:
            tunnel_proc = start_tunneld()
            if not tunneld_running():
                return 4  # 起隧道失败,前面已打印原因
        else:
            info("iOS < 17,无需 tunnel。")

        if not auto_mount():
            return 5

        print()
        ok("激活完成!(= AScript 的 active.exe 那一步)")
        print()
        print("下一步在手机上操作:")
        print("  1. 点开你的自启动版 WDA(应出现两行英文,代表 WDA 正在运行)。")
        print("  2. 现在可以拔掉数据线,WDA 会继续在手机上独立运行(绑定 8100)。")
        print("  3. autotk 连 http://<手机IP>:8100 即可。")

        if args.wda_ip:
            print()
            verify_wda(args.wda_ip)
    finally:
        if tunnel_proc is not None and not args.keep_tunnel:
            # DDI 挂好后 tunnel 已无需保留(tap 启动用手机本地框架)。
            tunnel_proc.terminate()

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\n已中断。")
        sys.exit(130)
