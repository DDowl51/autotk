// 真·全栈 e2e：SDK(js-sha256 签名) → 运行中的服务端(node:crypto 验签)。
// 全程走 HTTP：管理端建产品/发码，再用 SDK 激活/心跳/超限/错签名。
import { LicenseClient, LicenseError } from "../dist/index.js";

const PORT = process.env.PORT ?? 3009;
const base = `http://localhost:${PORT}`;
function assert(cond, msg) {
  if (!cond) {
    console.error("SDK-E2E FAIL:", msg);
    process.exit(1);
  }
}
const post = async (path, body, headers = {}) =>
  (await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  })).json();

// 管理员登录（由 seed 创建的 admin/admin123）
const login = await post("/admin/login", { username: "admin", password: "admin123" });
assert(login.token, "admin 登录失败");
const H = { authorization: `Bearer ${login.token}` };

// 建产品（拿 key+secret）+ 发 1 个码（maxDevices=1）
const prod = await post("/admin/products", { name: "sdk-e2e" }, H);
assert(prod.key && prod.secret, "建产品失败");
const issued = await post("/admin/codes", { productId: prod.id, count: 1, maxDevices: 1 }, H);
const code = issued.codes?.[0];
assert(code, "发码失败");

// SDK 激活（js-sha256 签名 → 服务端验签）
const client = new LicenseClient({
  baseUrl: base,
  productKey: prod.key,
  productSecret: prod.secret,
  deviceId: "sdk-dev-A",
});
const act = await client.activate(code);
assert(act.token, "SDK 激活未拿到 token");
console.log("SDK activate OK, reused =", act.reused);
assert(await client.isActivated(), "应处于已激活");

// 心跳
const hb = await client.heartbeat();
assert(hb.token, "SDK 心跳失败");

// 第二台设备超限 → device_limit
const client2 = new LicenseClient({
  baseUrl: base,
  productKey: prod.key,
  productSecret: prod.secret,
  deviceId: "sdk-dev-B",
});
try {
  await client2.activate(code);
  assert(false, "第二台应被拒（device_limit）");
} catch (e) {
  assert(e instanceof LicenseError && e.code === "device_limit", "应 device_limit，实得 " + (e?.code ?? e));
}

// 错误 secret → 服务端验签失败（401）→ SDK 抛 LicenseError
const badClient = new LicenseClient({
  baseUrl: base,
  productKey: prod.key,
  productSecret: "wrong-secret",
  deviceId: "sdk-dev-C",
  maxRetries: 0,
});
try {
  await badClient.activate(code);
  assert(false, "错 secret 应被拒");
} catch (e) {
  assert(e instanceof LicenseError, "错 secret 应抛 LicenseError，实得 " + e);
}

console.log("SDK E2E OK ✅");
