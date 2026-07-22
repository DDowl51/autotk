#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
wda_gui.py — 「激活 WDA」图形工具（给非技术买家双击用）。

包一层 tkinter 界面复用 activate_wda.py 的逻辑：
  手机每次重启后 → 点「① 激活手机 WDA」→ 按提示在手机上点开 WDA 图标 → autotk 就能连上了。

- 打包成独立 exe（买家电脑无需装 Python）：见同目录 build-激活WDA.bat（PyInstaller）。
- 前置：买家电脑要装 pymobiledevice3（`pip install -U pymobiledevice3`）；iOS 17+ 激活需管理员权限。
  （这些由卖家在买家电脑上一次性配好，见 docs/交付/交付总纲.md 七。）
"""
from __future__ import annotations

import os
import queue
import sys
import threading
import tkinter as tk
from tkinter import scrolledtext

import activate_wda

BG = "#0f1115"
CARD = "#191c22"
ACCENT = "#fe2c55"
TEXT = "#e6e8eb"
DIM = "#9aa0a6"


def relaunch_as_admin() -> None:
    """Windows 下以管理员身份重开自己（iOS 17+ 挂载需要）。"""
    if os.name != "nt":
        return
    import ctypes

    params = " ".join(f'"{a}"' for a in sys.argv)
    ctypes.windll.shell32.ShellExecuteW(None, "runas", sys.executable, params, None, 1)
    sys.exit(0)


class App:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.q: "queue.Queue[object]" = queue.Queue()
        self.running = False

        root.title("激活 WDA — 手机重启后点这里")
        root.configure(bg=BG)
        root.geometry("640x520")
        root.minsize(560, 460)

        tk.Label(root, text="激活 WDA", bg=BG, fg=TEXT, font=("Microsoft YaHei", 20, "bold")).pack(pady=(18, 2))
        tk.Label(
            root,
            text="手机每次重启后，用数据线连上电脑，点下面的按钮激活一次。",
            bg=BG, fg=DIM, font=("Microsoft YaHei", 10),
        ).pack()

        if os.name == "nt" and not activate_wda.is_admin():
            warn = tk.Frame(root, bg="#3a2a10")
            warn.pack(fill="x", padx=18, pady=(10, 0))
            tk.Label(
                warn, text="⚠ 当前不是管理员权限，iOS 17+ 手机激活会失败。",
                bg="#3a2a10", fg="#ffcf70", font=("Microsoft YaHei", 10),
            ).pack(side="left", padx=10, pady=6)
            tk.Button(
                warn, text="以管理员身份重开", command=relaunch_as_admin,
                bg="#5a4416", fg=TEXT, relief="flat", font=("Microsoft YaHei", 9), cursor="hand2",
            ).pack(side="right", padx=10, pady=6)

        self.btn = tk.Button(
            root, text="①  激活手机 WDA", command=self.on_activate,
            bg=ACCENT, fg="white", relief="flat", font=("Microsoft YaHei", 15, "bold"),
            height=2, cursor="hand2", activebackground="#d81f45",
        )
        self.btn.pack(fill="x", padx=18, pady=(16, 8))

        row = tk.Frame(root, bg=BG)
        row.pack(fill="x", padx=18)
        tk.Button(
            row, text="检测环境", command=self.on_check,
            bg=CARD, fg=TEXT, relief="flat", font=("Microsoft YaHei", 10), cursor="hand2",
        ).pack(side="left")
        tk.Label(row, text="手机IP(可选，验证用)：", bg=BG, fg=DIM, font=("Microsoft YaHei", 9)).pack(side="left", padx=(14, 4))
        self.ip = tk.Entry(row, width=16, font=("Consolas", 10))
        self.ip.pack(side="left")

        self.status = tk.Label(root, text="就绪。连好手机、点上面的按钮。", bg=BG, fg=DIM, font=("Microsoft YaHei", 10))
        self.status.pack(pady=(10, 4))

        self.text = scrolledtext.ScrolledText(
            root, bg="#0b0d10", fg="#c8ccd2", insertbackground=TEXT,
            font=("Consolas", 9), relief="flat", state="disabled", height=12,
        )
        self.text.pack(fill="both", expand=True, padx=18, pady=(0, 16))

        self.root.after(100, self._drain)

    # 供 activate_wda 回调（在工作线程里）——只塞队列，UI 更新在主线程 _drain 里做。
    def log(self, line: str) -> None:
        self.q.put(line)

    def _drain(self) -> None:
        try:
            while True:
                item = self.q.get_nowait()
                if isinstance(item, tuple) and item and item[0] == "__DONE__":
                    self._finish(int(item[1]))
                    continue
                self.text.configure(state="normal")
                self.text.insert("end", str(item) + "\n")
                self.text.see("end")
                self.text.configure(state="disabled")
        except queue.Empty:
            pass
        self.root.after(100, self._drain)

    def _finish(self, code: int) -> None:
        self.running = False
        self.btn.configure(state="normal", text="①  激活手机 WDA")
        if code == 0:
            self.status.configure(text="✅ 激活成功！现在去手机上点开 WDA 图标，就能拔线用了。", fg="#7fd18a")
        else:
            self.status.configure(text="❌ 没成功——看下面日志的红色 ❌ 提示排查。", fg="#ff8a8a")

    def _run(self, fn) -> None:
        if self.running:
            return
        self.running = True
        self.btn.configure(state="disabled", text="激活中…")
        self.status.configure(text="激活中，请稍候（首次挂镜像可能要 1~2 分钟）…", fg=DIM)
        self.text.configure(state="normal")
        self.text.delete("1.0", "end")
        self.text.configure(state="disabled")

        def worker() -> None:
            activate_wda.set_logger(self.log)
            code = 99
            try:
                code = fn()
            except Exception as e:  # noqa: BLE001
                self.q.put(f"❌ 出错：{e}")
            finally:
                activate_wda.set_logger(None)
                self.q.put(("__DONE__", code))

        threading.Thread(target=worker, daemon=True).start()

    def on_activate(self) -> None:
        ip = self.ip.get().strip() or None
        self._run(lambda: activate_wda.activate(wda_ip=ip))

    def on_check(self) -> None:
        self._run(activate_wda.check_env)


def main() -> None:
    root = tk.Tk()
    App(root)
    root.mainloop()


if __name__ == "__main__":
    main()
