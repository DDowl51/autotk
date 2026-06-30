import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { io as Client, type Socket } from "socket.io-client";
import { DeviceRegistry } from "../../src/domain/registry";
import { LogHub } from "../../src/domain/log-hub";
import { AliasStore } from "../../src/domain/alias-store";
import { MemoryDeviceStore } from "../../src/adapters/memory-store";
import { attachGateway } from "../../src/gateway";
import { EVT } from "@mc/shared";

let httpServer: HttpServer;
let url: string;

beforeAll(
  () =>
    new Promise<void>((resolve) => {
      httpServer = createServer();
      const ioServer = new Server(httpServer);
      attachGateway(
        ioServer,
        new DeviceRegistry(new MemoryDeviceStore(), Date.now, new AliasStore()),
        new LogHub(),
      );
      httpServer.listen(() => {
        const addr = httpServer.address();
        const port = typeof addr === "object" && addr ? addr.port : 0;
        url = `http://localhost:${port}`;
        resolve();
      });
    }),
);

afterAll(() => {
  httpServer.close();
});

function once<T = any>(socket: Socket, evt: string): Promise<T> {
  return new Promise((res) => socket.once(evt, res));
}

/** 轮询等待某条件成立（最多 ~2s），避免依赖事件先后顺序。 */
async function waitFor(cond: () => boolean, ms = 2000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error("waitFor 超时");
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe("Hub 实时协议（真 socket.io）", () => {
  it("设备注册 → 操作员收到 上线/状态/下线", async () => {
    const operator = Client(url, { auth: { role: "operator" }, transports: ["websocket"] });
    const snap = await once<unknown[]>(operator, EVT.devicesSnapshot);
    expect(Array.isArray(snap)).toBe(true);

    const device = Client(url, {
      auth: { role: "device", deviceId: "d1", deviceName: "手机A", version: "1.0" },
      transports: ["websocket"],
    });

    const online = await once<any>(operator, EVT.deviceUpdate);
    expect(online).toMatchObject({ deviceId: "d1", deviceName: "手机A", online: true });

    device.emit(EVT.deviceStatus, { running: true, module: "forYou", page: "comments", ts: Date.now() });
    const statusUpd = await once<any>(operator, EVT.deviceUpdate);
    expect(statusUpd.status?.module).toBe("forYou");
    expect(statusUpd.status?.page).toBe("comments"); // #4：页面透传
    expect(statusUpd.online).toBe(true);

    device.close();
    const offline = await once<any>(operator, EVT.deviceUpdate);
    expect(offline).toMatchObject({ deviceId: "d1", online: false });

    operator.close();
  });

  it("新操作员连上能在快照里看到已在线设备", async () => {
    const device = Client(url, {
      auth: { role: "device", deviceId: "d2", deviceName: "手机B" },
      transports: ["websocket"],
    });
    await new Promise((r) => setTimeout(r, 100)); // 等注册落库

    const operator = Client(url, { auth: { role: "operator" }, transports: ["websocket"] });
    const snap = await once<any[]>(operator, EVT.devicesSnapshot);
    const d2 = snap.find((d) => d.deviceId === "d2");
    expect(d2).toBeTruthy();
    expect(d2.online).toBe(true);

    device.close();
    operator.close();
  });

  it("操作员订阅日志 → 收快照 + 实时增量；手机收到 logs:wanted 切频率", async () => {
    const device = Client(url, {
      auth: { role: "device", deviceId: "dlog", deviceName: "日志机" },
      transports: ["websocket"],
    });
    const wanted: Array<{ on?: boolean }> = [];
    device.on(EVT.logsWanted, (m) => wanted.push(m));

    // 手机先发一批日志（此时没人看，进 Hub 缓冲）。
    await once(device, "connect");
    device.emit(EVT.deviceLog, { lines: [{ level: "info", msg: "启动养号", ts: 1 }] });
    await new Promise((r) => setTimeout(r, 50));

    const operator = Client(url, { auth: { role: "operator" }, transports: ["websocket"] });
    const logs: any[] = [];
    operator.on(EVT.deviceLogs, (m) => logs.push(m));
    await once(operator, EVT.devicesSnapshot);

    operator.emit(EVT.watchLogs, { deviceId: "dlog", on: true });

    // 首个观看者 → 手机收到 logs:wanted{on:true}。
    await waitFor(() => wanted.some((w) => w.on === true));

    // 订阅后先收到 replace 全量快照（含之前缓冲的那条）。
    await waitFor(() => logs.some((l) => l.replace));
    const snap = logs.find((l) => l.replace);
    expect(snap.deviceId).toBe("dlog");
    expect(snap.lines.map((l: any) => l.msg)).toContain("启动养号");

    // 之后手机再发，操作员实时收到增量（无 replace）。
    device.emit(EVT.deviceLog, { lines: [{ level: "warn", msg: "弹窗已逃离", ts: 2 }] });
    await waitFor(() => logs.some((l) => !l.replace && l.lines[0]?.msg === "弹窗已逃离"));
    const incr = logs.find((l) => !l.replace && l.lines[0]?.msg === "弹窗已逃离");
    expect(incr.lines[0]).toMatchObject({ level: "warn", msg: "弹窗已逃离" });

    // 取消订阅 → 手机收到 logs:wanted{on:false}。
    operator.emit(EVT.watchLogs, { deviceId: "dlog", on: false });
    await waitFor(() => wanted.some((w) => w.on === false));

    device.close();
    operator.close();
  });

  it("观看者断开 → 手机自动收到 logs:wanted{on:false}", async () => {
    const device = Client(url, {
      auth: { role: "device", deviceId: "dlog2", deviceName: "日志机2" },
      transports: ["websocket"],
    });
    const wanted: Array<{ on?: boolean }> = [];
    device.on(EVT.logsWanted, (m) => wanted.push(m));
    await once(device, "connect");

    const operator = Client(url, { auth: { role: "operator" }, transports: ["websocket"] });
    await once(operator, EVT.devicesSnapshot);
    operator.emit(EVT.watchLogs, { deviceId: "dlog2", on: true });
    await waitFor(() => wanted.some((w) => w.on === true));

    operator.close(); // 没正常取消就直接断开
    await waitFor(() => wanted.some((w) => w.on === false));

    device.close();
  });

  it("改设备名：操作员发 rename → 收到 device:update 带新名", async () => {
    const device = Client(url, {
      auth: { role: "device", deviceId: "dren", deviceName: "iPhone" },
      transports: ["websocket"],
    });
    await once(device, "connect");

    const operator = Client(url, { auth: { role: "operator" }, transports: ["websocket"] });
    await once(operator, EVT.devicesSnapshot);

    const updates: any[] = [];
    operator.on(EVT.deviceUpdate, (d) => updates.push(d));
    operator.emit(EVT.deviceRename, { deviceId: "dren", alias: "美区-01" });
    await waitFor(() => updates.some((d) => d.deviceId === "dren" && d.deviceName === "美区-01"));

    device.close();
    operator.close();
  });

  it("发布任务：在线设备收到 task、逐步回报 → 操作员收 sent..published；离线 offline", async () => {
    const device = Client(url, {
      auth: { role: "device", deviceId: "dpub", deviceName: "发布机" },
      transports: ["websocket"],
    });
    const tasks: any[] = [];
    device.on(EVT.publishTask, (t) => {
      tasks.push(t);
      device.emit(EVT.publishResult, { taskId: t.taskId, status: "downloading" });
      device.emit(EVT.publishResult, { taskId: t.taskId, status: "published" });
    });
    await once(device, "connect");

    const operator = Client(url, { auth: { role: "operator" }, transports: ["websocket"] });
    const prog: any[] = [];
    operator.on(EVT.publishProgress, (p) => prog.push(p));
    await once(operator, EVT.devicesSnapshot);

    operator.emit(EVT.publishEnqueue, {
      taskId: "pt1",
      deviceId: "dpub",
      videoName: "v.mp4",
      caption: "hello",
      source: { kind: "lan", url: "http://op/f/abc" },
    });

    await waitFor(() => tasks.length > 0);
    expect(tasks[0]).toMatchObject({ taskId: "pt1", videoName: "v.mp4", source: { kind: "lan" } });

    await waitFor(() => prog.some((p) => p.taskId === "pt1" && p.status === "published"));
    const seq = prog.filter((p) => p.taskId === "pt1").map((p) => p.status);
    expect(seq).toEqual(["sent", "downloading", "published"]);

    // 离线设备 → offline
    operator.emit(EVT.publishEnqueue, {
      taskId: "pt2",
      deviceId: "ghost",
      videoName: "v.mp4",
      caption: "x",
      source: { kind: "lan", url: "http://op/f/x" },
    });
    await waitFor(() => prog.some((p) => p.taskId === "pt2" && p.status === "offline"));

    device.close();
    operator.close();
  });

  it("批量配置下发：在线设备收到 apply、回执 → 操作员收 sent+ok；离线台 offline", async () => {
    const device = Client(url, {
      auth: { role: "device", deviceId: "dcfg", deviceName: "配置机" },
      transports: ["websocket"],
    });
    const applied: any[] = [];
    device.on(EVT.configApply, (m) => {
      applied.push(m);
      device.emit(EVT.configResult, { jobId: m.jobId, ok: true }); // 手机应用成功回执
    });
    await once(device, "connect");

    const operator = Client(url, { auth: { role: "operator" }, transports: ["websocket"] });
    const prog: any[] = [];
    operator.on(EVT.configProgress, (p) => prog.push(p));
    await once(operator, EVT.devicesSnapshot);

    operator.emit(EVT.configPush, {
      jobId: "job-1",
      deviceIds: ["dcfg", "ghost"], // ghost 未连=离线
      patch: { clickWaitTime: 2 },
    });

    // 在线台收到 apply。
    await waitFor(() => applied.length > 0);
    expect(applied[0]).toMatchObject({ jobId: "job-1", patch: { clickWaitTime: 2 } });

    // 操作员收到 dcfg 的 sent→ok，ghost 的 offline。
    await waitFor(() => prog.some((p) => p.deviceId === "dcfg" && p.status === "ok"));
    const dcfg = prog.filter((p) => p.deviceId === "dcfg").map((p) => p.status);
    expect(dcfg).toEqual(["sent", "ok"]);
    await waitFor(() => prog.some((p) => p.deviceId === "ghost" && p.status === "offline"));

    device.close();
    operator.close();
  });
});
