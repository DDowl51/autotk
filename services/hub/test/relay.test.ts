import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { EventEmitter } from "node:events";
import { RelayStore, handleRelay } from "../src/relay";

describe("RelayStore", () => {
  it("put → get 拿回原始字节", () => {
    const s = new RelayStore();
    const id = s.put(Buffer.from("hello"), "video/mp4");
    expect(s.get(id)).toMatchObject({ contentType: "video/mp4" });
    expect(s.get(id)!.data.toString()).toBe("hello");
  });

  it("TTL 过期后取不到", () => {
    let t = 1000;
    const s = new RelayStore({ ttlMs: 100 }, () => t);
    const id = s.put(Buffer.from("x"));
    t = 1050;
    expect(s.get(id)).toBeTruthy();
    t = 1200; // 过期
    expect(s.get(id)).toBeUndefined();
  });

  it("超总量上限淘汰最旧", () => {
    const s = new RelayStore({ maxBytes: 10 });
    const a = s.put(Buffer.alloc(6));
    const b = s.put(Buffer.alloc(6)); // 共 12 > 10 → 淘汰 a
    expect(s.get(a)).toBeUndefined();
    expect(s.get(b)).toBeTruthy();
    expect(s.totalBytes).toBe(6);
  });
});

describe("handleRelay (真 HTTP)", () => {
  let server: Server;
  let url: string;
  const store = new RelayStore();

  beforeAll(
    () =>
      new Promise<void>((resolve) => {
        server = createServer((req, res) => {
          if (!handleRelay(store, req, res)) res.writeHead(404).end();
        });
        server.listen(0, () => {
          const a = server.address();
          url = `http://localhost:${typeof a === "object" && a ? a.port : 0}`;
          resolve();
        });
      }),
  );
  afterAll(() => server.close());

  it("POST /relay 存视频 → GET /relay/:id 取回；坏 id 404", async () => {
    const up = await fetch(`${url}/relay`, {
      method: "POST",
      headers: { "Content-Type": "video/mp4" },
      body: Buffer.from("VIDEO-BYTES"),
    });
    expect(up.status).toBe(200);
    const { id, path } = (await up.json()) as { id: string; path: string };
    expect(path).toBe(`/relay/${id}`);

    const down = await fetch(`${url}${path}`);
    expect(down.status).toBe(200);
    expect(down.headers.get("content-type")).toBe("video/mp4");
    expect(await down.text()).toBe("VIDEO-BYTES");

    expect((await fetch(`${url}/relay/deadbeef`)).status).toBe(404);
  });
});

describe("handleRelay 错误兜底", () => {
  it("POST body 读取出错 → 400，不抛未捕获", async () => {
    const store = new RelayStore();
    const req = Object.assign(new EventEmitter(), {
      method: "POST",
      url: "/relay",
      headers: {},
    }) as unknown as IncomingMessage;
    let code = 0;
    const res = {
      writeHead(c: number) {
        code = c;
        return res;
      },
      end() {
        return res;
      },
    } as unknown as ServerResponse;

    expect(handleRelay(store, req, res)).toBe(true);
    (req as unknown as EventEmitter).emit("error", new Error("boom")); // 触发 readBody reject → .catch
    await new Promise((r) => setTimeout(r, 10));
    expect(code).toBe(400);
  });
});
