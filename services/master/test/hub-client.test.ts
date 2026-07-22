import { describe, expect, it, vi } from "vitest";
import { createHubClient } from "../src/hub/hubClient";
import type { MinimalSocket, SocketAuth } from "../src/hub/socket";

/** 内存假 socket:记录 emit,可手动触发 on 回调 + 切换 connected。 */
class FakeSocket implements MinimalSocket {
  connected = true;
  emits: { event: string; payload: unknown }[] = [];
  private handlers = new Map<string, (p: unknown) => void>();
  constructor(readonly url: string, readonly auth: SocketAuth) {}
  on(event: string, cb: (p: unknown) => void): this {
    this.handlers.set(event, cb);
    return this;
  }
  emit(event: string, payload?: unknown): this {
    this.emits.push({ event, payload });
    return this;
  }
  disconnect(): this {
    this.connected = false;
    return this;
  }
  /** 测试用:模拟 Hub 下发一个事件。 */
  fire(event: string, payload: unknown): void {
    this.handlers.get(event)?.(payload);
  }
  last(event: string): unknown {
    return [...this.emits].reverse().find((e) => e.event === event)?.payload;
  }
}

function setup(overrides: Partial<Parameters<typeof createHubClient>[0]> = {}) {
  const sockets: FakeSocket[] = [];
  const onConfigApply = vi.fn(async () => ({ ok: true as const }));
  const onPublishTask = vi.fn();
  const onDeviceControl = vi.fn();
  const hub = createHubClient({
    hubUrl: "http://hub",
    socketFactory: (url, auth) => {
      const s = new FakeSocket(url, auth);
      sockets.push(s);
      return s;
    },
    onConfigApply,
    onPublishTask,
    onDeviceControl,
    ...overrides,
  });
  return { hub, sockets, onConfigApply, onPublishTask, onDeviceControl };
}

describe("createHubClient", () => {
  it("每台一个 socket,auth 带 role=device + deviceId;重复注册幂等", () => {
    const { hub, sockets } = setup();
    hub.registerDevice({ deviceId: "d1", deviceName: "手机1" });
    hub.registerDevice({ deviceId: "d2", deviceName: "手机2", version: "2.0" });
    hub.registerDevice({ deviceId: "d1", deviceName: "手机1" }); // 幂等
    expect(sockets).toHaveLength(2);
    expect(sockets[0].auth).toMatchObject({ role: "device", deviceId: "d1", deviceName: "手机1" });
    expect(sockets[1].auth).toMatchObject({ role: "device", deviceId: "d2", version: "2.0" });
  });

  it("reportStatus/reportLog/reportPublishResult 发到对应设备 socket", () => {
    const { hub, sockets } = setup();
    hub.registerDevice({ deviceId: "d1", deviceName: "x" });
    hub.reportStatus("d1", { running: true, ts: 1 });
    hub.reportLog("d1", [{ level: "info", msg: "hi", ts: 1 }]);
    hub.reportPublishResult("d1", "t1", "published");
    expect(sockets[0].last("device:status")).toEqual({ running: true, ts: 1 });
    expect(sockets[0].last("device:log")).toEqual({ lines: [{ level: "info", msg: "hi", ts: 1 }] });
    expect(sockets[0].last("publish:result")).toEqual({ taskId: "t1", status: "published", error: undefined });
  });

  it("收 config:apply → 调 onConfigApply → 回 config:result{ok}", async () => {
    const { hub, sockets, onConfigApply } = setup();
    hub.registerDevice({ deviceId: "d1", deviceName: "x" });
    sockets[0].fire("config:apply", { jobId: "j1", patch: { clickWaitTime: 2 } });
    await vi.waitFor(() => expect(onConfigApply).toHaveBeenCalledWith("d1", { clickWaitTime: 2 }));
    expect(sockets[0].last("config:result")).toEqual({ jobId: "j1", ok: true, error: undefined });
  });

  it("onConfigApply 失败 → 回 config:result{ok:false,error}", async () => {
    const onConfigApply = vi.fn(async () => ({ ok: false as const, error: "参数非法" }));
    const { hub, sockets } = setup({ onConfigApply });
    hub.registerDevice({ deviceId: "d1", deviceName: "x" });
    sockets[0].fire("config:apply", { jobId: "j2", patch: {} });
    await vi.waitFor(() => expect(sockets[0].last("config:result")).toEqual({ jobId: "j2", ok: false, error: "参数非法" }));
  });

  it("收 publish:task → 调 onPublishTask(deviceId, task)", () => {
    const { hub, sockets, onPublishTask } = setup();
    hub.registerDevice({ deviceId: "d1", deviceName: "x" });
    const task = { taskId: "t1", videoName: "v.mp4", caption: "hi", source: { kind: "lan" as const, url: "http://x/v" } };
    sockets[0].fire("publish:task", task);
    expect(onPublishTask).toHaveBeenCalledWith("d1", task);
  });

  it("收 device:control → 调 onDeviceControl(deviceId, action);非法 action 忽略", () => {
    const { hub, sockets, onDeviceControl } = setup();
    hub.registerDevice({ deviceId: "d1", deviceName: "x" });
    sockets[0].fire("device:control", { action: "pause" });
    sockets[0].fire("device:control", { action: "resume" });
    sockets[0].fire("device:control", { action: "bogus" }); // 忽略
    expect(onDeviceControl.mock.calls).toEqual([["d1", "pause"], ["d1", "resume"]]);
  });

  it("connected 反映 socket 状态;close 断开全部", async () => {
    const { hub, sockets } = setup();
    hub.registerDevice({ deviceId: "d1", deviceName: "x" });
    hub.registerDevice({ deviceId: "d2", deviceName: "y" });
    expect(hub.connected("d1")).toBe(true);
    expect(hub.connected("nope")).toBe(false);
    await hub.close();
    expect(sockets.every((s) => !s.connected)).toBe(true);
  });

  it("未注册设备上报被静默忽略(不抛)", () => {
    const { hub } = setup();
    expect(() => hub.reportStatus("ghost", { running: true, ts: 0 })).not.toThrow();
  });
});
