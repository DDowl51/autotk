import { describe, it, expect } from "vitest";
import os from "node:os";
import { io as ioClient } from "socket.io-client";
import { startHub } from "../src/start-hub";

describe("startHub", () => {
  it("起服 → 拿到端口 → 可连 → close", async () => {
    const hub = await startHub({ port: 0, dataDir: os.tmpdir() });
    expect(hub.port).toBeGreaterThan(0);

    await new Promise<void>((resolve, reject) => {
      const c = ioClient(`http://localhost:${hub.port}`, {
        auth: { role: "operator" },
        transports: ["websocket"],
      });
      const t = setTimeout(() => reject(new Error("connect timeout")), 3000);
      c.on("connect", () => {
        clearTimeout(t);
        c.close();
        resolve();
      });
      c.on("connect_error", (e) => {
        clearTimeout(t);
        reject(e);
      });
    });

    await hub.close();
  });

  it("起始端口被占 → 回退到下一个空闲端口", async () => {
    const a = await startHub({ port: 0, dataDir: os.tmpdir() });
    const b = await startHub({ port: a.port, dataDir: os.tmpdir(), maxPortTries: 20 });
    expect(b.port).toBeGreaterThan(a.port);
    await a.close();
    await b.close();
  });

  it("候选端口表：表内第一个被占 → 落到表内下一个空闲端口", async () => {
    const a = await startHub({ port: 0, dataDir: os.tmpdir() }); // 占住 Pa
    const tmp = await startHub({ port: 0, dataDir: os.tmpdir() }); // 借一个真实端口 Pb
    const pb = tmp.port;
    await tmp.close(); // 释放 Pb，使其空闲
    const b = await startHub({ ports: [a.port, pb], dataDir: os.tmpdir() });
    expect(b.port).toBe(pb); // 表内第一个(Pa)被占 → 用第二个 Pb
    await a.close();
    await b.close();
  });
});
