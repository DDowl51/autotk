import { describe, expect, it, vi } from "vitest";
import { createReceiverRegistry, type ReceiverConn } from "../src/receiver/receiverRegistry";
import type { DownloadCommand } from "../src/receiver/protocol";

const cmd = (taskId: string): DownloadCommand => ({ type: "download", taskId, url: `http://x/${taskId}`, videoName: `${taskId}.mp4` });
function fakeConn(): ReceiverConn & { sent: DownloadCommand[] } {
  const sent: DownloadCommand[] = [];
  return { sent, send: (c) => sent.push(c) };
}

describe("createReceiverRegistry", () => {
  it("attach → isOnline;detach(同连接)→ 离线", () => {
    const reg = createReceiverRegistry();
    const c = fakeConn();
    expect(reg.isOnline("u1")).toBe(false);
    reg.attach("u1", c);
    expect(reg.isOnline("u1")).toBe(true);
    reg.detach("u1", c);
    expect(reg.isOnline("u1")).toBe(false);
  });

  it("detach(旧连接,已被新连接替换)→ 不误标离线", () => {
    const reg = createReceiverRegistry();
    const c1 = fakeConn();
    const c2 = fakeConn();
    reg.attach("u1", c1);
    reg.attach("u1", c2); // 重连替换
    reg.detach("u1", c1); // c1 的迟到 disconnect
    expect(reg.isOnline("u1")).toBe(true); // 仍在线(c2)
    reg.pushDownload("u1", cmd("t1"));
    expect(c2.sent).toHaveLength(1); // 命令走新连接
    expect(c1.sent).toHaveLength(0);
  });

  it("pushDownload 在线 → 走该连接;离线 → 抛错", () => {
    const reg = createReceiverRegistry();
    const c = fakeConn();
    reg.attach("u1", c);
    reg.pushDownload("u1", cmd("t1"));
    expect(c.sent).toEqual([cmd("t1")]);
    expect(() => reg.pushDownload("ghost", cmd("t2"))).toThrow(/离线|online|not/i);
  });

  it("handleProgress → onProgress 订阅者收到 (udid, progress)", () => {
    const reg = createReceiverRegistry();
    const cb = vi.fn();
    reg.onProgress(cb);
    reg.handleProgress("u1", { type: "progress", taskId: "t1", status: "downloaded", assetId: "ph://1" });
    expect(cb).toHaveBeenCalledWith("u1", { type: "progress", taskId: "t1", status: "downloaded", assetId: "ph://1" });
  });

  it("多个 onProgress 订阅者都收到", () => {
    const reg = createReceiverRegistry();
    const a = vi.fn();
    const b = vi.fn();
    reg.onProgress(a);
    reg.onProgress(b);
    reg.handleProgress("u1", { type: "progress", taskId: "t", status: "failed", error: "x" });
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });
});
