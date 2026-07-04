import test from "node:test";
import assert from "node:assert/strict";
import { HUB_PORTS, hostOf, candidateUrls } from "../src/hub/hubUrl";
import { probeHub } from "../src/hub/probe";

test("hostOf：取 host，去端口/路径；非法 → null", () => {
  assert.equal(hostOf("http://192.168.1.5:4000"), "192.168.1.5");
  assert.equal(hostOf("http://192.168.1.5:4000/x/y"), "192.168.1.5");
  assert.equal(hostOf("https://hub.local:51820"), "hub.local");
  assert.equal(hostOf(""), null);
  assert.equal(hostOf("192.168.1.5:4000"), null);
});

test("candidateUrls：按共享端口表在已知 host 上生成候选地址", () => {
  assert.deepEqual(
    candidateUrls("10.0.0.2"),
    HUB_PORTS.map((p) => `http://10.0.0.2:${p}`),
  );
});

test("probeHub：/whoami 返回 svc=autotk-hub → 判定为我们的 Hub（true）", async () => {
  const fakeFetch = async (u: string) => {
    assert.match(u, /\/whoami$/, "应打 /whoami 身份端点");
    return { ok: true, text: async () => '{"svc":"autotk-hub"}' };
  };
  assert.equal(await probeHub("http://h:4000", fakeFetch), true);
});

test("probeHub：非 200 / 别的 socket.io 服务（无 autotk-hub 标识）/ 抛错 → false", async () => {
  assert.equal(await probeHub("http://h:4000", async () => ({ ok: false, text: async () => "" })), false);
  // 别的 socket.io 服务：握手含 sid 但没有我们的 svc 标识 → 认作「不是我们的」。
  assert.equal(
    await probeHub("http://h:4000", async () => ({ ok: true, text: async () => '0{"sid":"abc"}' })),
    false,
  );
  assert.equal(
    await probeHub("http://h:4000", async () => {
      throw new Error("connection refused");
    }),
    false,
  );
});
