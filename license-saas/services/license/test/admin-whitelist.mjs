// 分销-产品白名单 e2e：可见性收窄、发码授权、连带隐藏、配额仍计入、客户端激活不受影响。
// 假设服务已在 PORT 运行，且已 seed 管理员 admin/admin123。
import { createHmac } from "node:crypto";

const PORT = process.env.PORT ?? 3009;
const base = `http://localhost:${PORT}`;

function assert(cond, msg) {
  if (!cond) {
    console.error("ADMIN-WHITELIST FAIL:", msg);
    process.exit(1);
  }
}
const call = async (method, path, body, token) => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
};

// 客户端签名请求（验证已发码对终端客户仍有效）。
const signedActivate = async (key, secret, obj) => {
  const body = JSON.stringify(obj);
  const ts = Date.now();
  const nonce = "n" + ts;
  const sig = createHmac("sha256", secret).update(`${key}\n${ts}\n${nonce}\n${body}`).digest("hex");
  const res = await fetch(`${base}/v1/activate`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-product-key": key,
      "x-timestamp": String(ts),
      "x-nonce": nonce,
      "x-signature": sig,
    },
    body,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
};

// 1. 管理员登录 + 建两个产品
let r = await call("POST", "/admin/login", { username: "admin", password: "admin123" });
assert(r.status === 201 && r.json?.token, "admin 登录");
const A = r.json.token;

const tag = Date.now();
r = await call("POST", "/admin/products", { name: "wl-P1-" + tag }, A);
const P1 = r.json;
r = await call("POST", "/admin/products", { name: "wl-P2-" + tag }, A);
const P2 = r.json;
assert(P1?.id && P1?.secret && P2?.id, "建 P1/P2");

// 2. 建分销：配额 2，白名单 [P1, P2]（建账号时即带白名单）
const ruser = "wl" + tag;
r = await call(
  "POST",
  "/admin/accounts",
  { username: ruser, password: "resel123", codeQuota: 2, role: "USER", productIds: [P1.id, P2.id] },
  A,
);
assert(r.status === 201 && r.json?.id, "建分销账号带白名单");
const resellerId = r.json.id;

// 3. 分销登录
r = await call("POST", "/admin/login", { username: ruser, password: "resel123" });
assert(r.status === 201 && r.json?.role === "USER", "分销登录");
const R = r.json.token;

// 4. 分销只见白名单内产品（此刻 P1+P2）
r = await call("GET", "/admin/products", undefined, R);
assert(r.json?.length === 2, "分销应见 2 个产品，实得 " + r.json?.length);

// 5. 配额内、白名单内发码：P1 一个、P2 一个 → used=2
r = await call("POST", "/admin/codes", { productId: P1.id, count: 1, maxDevices: 1 }, R);
assert(r.status === 201 && r.json?.codes?.length === 1, "P1 发码成功");
const p1Code = r.json.codes[0];
r = await call("POST", "/admin/codes", { productId: P2.id, count: 1, maxDevices: 1 }, R);
assert(r.status === 201, "P2 发码成功");

// 6. 超配额 → 403 quota_exceeded
r = await call("POST", "/admin/codes", { productId: P2.id, count: 1 }, R);
assert(r.status === 403 && r.json?.message?.startsWith("quota_exceeded"), "超额应 403 quota_exceeded");

// 7. 管理员看账号 → productIds 含 P1+P2
r = await call("GET", "/admin/accounts", undefined, A);
const accRow = r.json.find((a) => a.id === resellerId);
assert(
  accRow && accRow.productIds.length === 2 && accRow.productIds.includes(P1.id),
  "账号列表应返回 productIds 白名单",
);

// 8. 管理员把白名单收紧为 [P2]（移除 P1）
r = await call("POST", `/admin/accounts/${resellerId}`, { productIds: [P2.id] }, A);
assert(r.status === 201, "更新白名单为 [P2]");

// 9. 分销产品列表只剩 P2
r = await call("GET", "/admin/products", undefined, R);
assert(r.json?.length === 1 && r.json[0].id === P2.id, "收紧后分销只见 P2");

// 10. 连带隐藏：分销码列表不再含 P1 的码（只剩 P2 的 1 个）
r = await call("GET", "/admin/codes", undefined, R);
assert(r.json?.length === 1 && r.json[0].productId === P2.id, "P1 码应从分销视图连带隐藏");

// 11. 但数据未删：管理员仍能看到 P1 的码
r = await call("GET", `/admin/codes?productId=${P1.id}`, undefined, A);
assert(r.json?.length === 1, "管理员仍能看到 P1 的码（数据未删）");

// 12. 白名单外发码被拒：P1 → 403 product_not_allowed
r = await call("POST", "/admin/codes", { productId: P1.id, count: 1 }, R);
assert(r.status === 403 && r.json?.message === "product_not_allowed", "白名单外发码应 403 product_not_allowed");

// 13. 配额仍计入隐藏码：used 仍=2 → 再发 P2 仍被配额拒（证明隐藏的 P1 码未退还预算）
r = await call("POST", "/admin/codes", { productId: P2.id, count: 1 }, R);
assert(r.status === 403 && r.json?.message?.startsWith("quota_exceeded"), "隐藏码仍计入配额，应 403 quota_exceeded");

// 14. 客户端激活：被隐藏的 P1 码对终端客户仍有效
r = await signedActivate(P1.key, P1.secret, { code: p1Code, deviceId: "devWL" });
assert(r.status === 201 && r.json?.token, "隐藏的 P1 码客户端激活仍有效，实得 " + r.status);

// 15. 清空白名单 → 分销看不到任何产品、发码全拒
r = await call("POST", `/admin/accounts/${resellerId}`, { productIds: [] }, A);
assert(r.status === 201, "清空白名单");
r = await call("GET", "/admin/products", undefined, R);
assert(r.json?.length === 0, "空白名单分销应见 0 产品");
r = await call("POST", "/admin/codes", { productId: P2.id, count: 1 }, R);
assert(r.status === 403, "空白名单发码应 403");

console.log("ADMIN WHITELIST E2E OK ✅");
