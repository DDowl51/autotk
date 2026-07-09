// 运营(OPERATOR)角色 e2e：角色提权、归属越权(IDOR)、额度池、产品白名单子集、可见性收窄。
// 假设服务已在 PORT 运行，且已 seed 管理员 admin/admin123。
// 单独跑： PORT=3009 node test/operator-role.mjs   （或经 test/e2e.sh 一并跑）

const PORT = process.env.PORT ?? 3009;
const base = `http://localhost:${PORT}`;

let passed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error("OPERATOR-ROLE FAIL:", msg);
    process.exit(1);
  }
  passed++;
}
const call = async (method, path, body, token) => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
};
const login = async (u, p) => {
  const r = await call("POST", "/admin/login", { username: u, password: p });
  return r;
};

const tag = Date.now();
let r;

// ---- 准备：ADMIN 登录、建 2 产品、建 1 个运营(额度池 100，可见产品仅 P1) ----
r = await login("admin", "admin123");
assert(r.status === 201 && r.json?.token, "admin 登录");
const A = r.json.token;

r = await call("POST", "/admin/products", { name: `op-P1-${tag}` }, A);
const P1 = r.json;
r = await call("POST", "/admin/products", { name: `op-P2-${tag}` }, A);
const P2 = r.json;
assert(P1?.id && P2?.id, "建 P1/P2");

const opUser = `op${tag}`;
r = await call(
  "POST",
  "/admin/accounts",
  { username: opUser, password: "oppass1", role: "OPERATOR", codeQuota: 100, productIds: [P1.id] },
  A,
);
assert(r.status === 201 && r.json?.role === "OPERATOR", "ADMIN 建运营账号");
const opId = r.json.id;

r = await login(opUser, "oppass1");
assert(r.status === 201 && r.json?.role === "OPERATOR", "运营登录，role=OPERATOR");
const O = r.json.token;

// ---- 不变式①：运营不能建/看不该看的产品 ----
r = await call("GET", "/admin/products", undefined, O);
assert(r.json?.length === 1 && r.json[0].id === P1.id, "运营只见白名单内产品 P1");
r = await call("POST", "/admin/products", { name: `hack-${tag}` }, O);
assert(r.status === 403 && r.json?.message === "admin only", "运营建产品应 403 admin only");

// ---- 不变式②：运营建账号只能 role=USER ----
r = await call("POST", "/admin/accounts", { username: `x1${tag}`, password: "pass12", role: "OPERATOR", codeQuota: 1, productIds: [P1.id] }, O);
assert(r.status === 403 && r.json?.message === "operator_can_only_create_dealer", "运营建运营应 403");
r = await call("POST", "/admin/accounts", { username: `x2${tag}`, password: "pass12", role: "ADMIN", codeQuota: 1, productIds: [P1.id] }, O);
assert(r.status === 403 && r.json?.message === "operator_can_only_create_dealer", "运营建管理员应 403");

// ---- 不变式⑤：分销可见产品必须 ⊆ 运营自己的白名单 ----
r = await call("POST", "/admin/accounts", { username: `x3${tag}`, password: "pass12", codeQuota: 10, productIds: [P2.id] }, O);
assert(r.status === 403 && r.json?.message === "product_not_allowed", "给分销分配自己看不到的产品 P2 应 403");

// ---- 不变式④：有限额运营不能给下级「不限」(留空额度) ----
r = await call("POST", "/admin/accounts", { username: `x4${tag}`, password: "pass12", productIds: [P1.id] }, O);
assert(r.status === 400 && r.json?.message === "quota_required", "有限额运营给下级留空额度应 400 quota_required");

// ---- 额度池：建 d1=60 OK；再建 50 超池(剩40) 403；建 40 恰好 OK；再建 1 超池(剩0) 403 ----
r = await call("POST", "/admin/accounts", { username: `d1${tag}`, password: "d1pass1", codeQuota: 60, productIds: [P1.id] }, O);
assert(r.status === 201 && r.json?.id, "建分销 d1 额度 60");
const d1Id = r.json.id;

r = await call("POST", "/admin/accounts", { username: `d1b${tag}`, password: "pass12", codeQuota: 50, productIds: [P1.id] }, O);
assert(r.status === 403 && r.json?.message?.startsWith("quota_pool_exceeded"), "超额度池(剩40要50)应 403 quota_pool_exceeded");

r = await call("POST", "/admin/accounts", { username: `d2${tag}`, password: "d2pass1", codeQuota: 40, productIds: [P1.id] }, O);
assert(r.status === 201 && r.json?.id, "建分销 d2 额度 40（池刚好占满 100）");
const d2Id = r.json.id;

r = await call("POST", "/admin/accounts", { username: `d3${tag}`, password: "pass12", codeQuota: 1, productIds: [P1.id] }, O);
assert(r.status === 403 && r.json?.message?.startsWith("quota_pool_exceeded"), "池满后再建 1 应 403");

// ---- 可见性：运营列表只含自己建的分销(d1,d2)，无 ADMIN/OPERATOR/自己 ----
r = await call("GET", "/admin/accounts", undefined, O);
const ids = (r.json ?? []).map((a) => a.id);
assert(r.json?.length === 2, "运营账号列表应只有自己建的 2 个分销，实得 " + r.json?.length);
assert(ids.includes(d1Id) && ids.includes(d2Id), "列表应含 d1/d2");
assert(!ids.includes(opId), "列表不应含运营自己");
assert((r.json ?? []).every((a) => a.role === "USER"), "列表里应全是 USER 分销");

// ---- 归属越权(IDOR)：ADMIN 另建一个不属于该运营的分销 dX，运营碰不得 ----
r = await call("POST", "/admin/accounts", { username: `dx${tag}`, password: "dxpass1", codeQuota: 5, productIds: [P1.id] }, A);
const dXId = r.json.id;
r = await call("POST", `/admin/accounts/${dXId}`, { disabled: true }, O);
assert(r.status === 403 && r.json?.message === "not_your_account", "运营改他人分销应 403 not_your_account");
r = await call("POST", `/admin/accounts/${dXId}/password`, { newPassword: "hacked1" }, O);
assert(r.status === 403 && r.json?.message === "not_your_account", "运营重置他人密码应 403");

// ---- 关键：运营不能自抬自己的额度（自己的账号 createdById 是 ADMIN，非自己）----
r = await call("POST", `/admin/accounts/${opId}`, { codeQuota: 99999 }, O);
assert(r.status === 403 && r.json?.message === "not_your_account", "运营自抬额度应 403 not_your_account");

// ---- 改额度也走额度池：d1 现 60，其他(d2)占 40 → d1 上限 60；改 61 超、改 60 OK、改 30 释放额度 ----
r = await call("POST", `/admin/accounts/${d1Id}`, { codeQuota: 61 }, O);
assert(r.status === 403 && r.json?.message?.startsWith("quota_pool_exceeded"), "改 d1 到 61 超池应 403");
r = await call("POST", `/admin/accounts/${d1Id}`, { codeQuota: 60 }, O);
assert(r.status === 201, "改 d1 到 60（恰好）应 OK");
r = await call("POST", `/admin/accounts/${d1Id}`, { codeQuota: 30 }, O);
assert(r.status === 201, "改 d1 到 30（释放 30 额度）应 OK");
// 释放后池剩 30，可再建 d3=30
r = await call("POST", "/admin/accounts", { username: `d3b${tag}`, password: "d3pass1", codeQuota: 30, productIds: [P1.id] }, O);
assert(r.status === 201, "释放额度后再建 d3=30 应 OK");

// ---- 改产品也要子集校验：把 d2 白名单改成含 P2 → 403；改成 [P1] → OK ----
r = await call("POST", `/admin/accounts/${d2Id}`, { productIds: [P2.id] }, O);
assert(r.status === 403 && r.json?.message === "product_not_allowed", "改 d2 白名单塞非法产品 P2 应 403");
r = await call("POST", `/admin/accounts/${d2Id}`, { productIds: [P1.id] }, O);
assert(r.status === 201, "改 d2 白名单为合法 [P1] 应 OK");

// ---- 运营建出来的分销就是普通 USER：额度内发码、白名单外拒 ----
r = await login(`d1${tag}`, "d1pass1");
assert(r.status === 201 && r.json?.role === "USER", "分销 d1 登录 role=USER");
const D1 = r.json.token;
r = await call("POST", "/admin/codes", { productId: P1.id, count: 1, maxDevices: 1 }, D1);
assert(r.status === 201 && r.json?.codes?.length === 1, "分销 d1 在白名单内发码 OK");
const d1Code = r.json.codes[0];
r = await call("POST", "/admin/codes", { productId: P2.id, count: 1 }, D1);
assert(r.status === 403 && r.json?.message === "product_not_allowed", "分销 d1 白名单外发码应 403");

// ---- 普通分销(USER)进不了账号管理（requireAdminOrOperator 挡住）----
r = await call("GET", "/admin/accounts", undefined, D1);
assert(r.status === 403, "分销读账号列表应 403");
r = await call("POST", "/admin/accounts", { username: `nope${tag}`, password: "pass12" }, D1);
assert(r.status === 403, "分销建账号应 403");

// ---- 可见性：运营看不到下级分销发的码（只看自己发的）----
r = await call("GET", "/admin/codes", undefined, O);
assert(!(r.json ?? []).some((c) => c.code === d1Code), "运营不应看到下级分销发的码");

// ---- 额度池双向耦合：另建运营 op2(额度5)，自己发码与给下级分额度共用同一池 ----
const op2User = `op2${tag}`;
r = await call("POST", "/admin/accounts", { username: op2User, password: "op2pass", role: "OPERATOR", codeQuota: 5, productIds: [P1.id] }, A);
assert(r.status === 201, "ADMIN 建运营 op2 额度 5");
r = await login(op2User, "op2pass");
const O2 = r.json.token;
// 给下级分销分 3 → 池剩 2 供自己发码
r = await call("POST", "/admin/accounts", { username: `e1${tag}`, password: "e1pass1", codeQuota: 3, productIds: [P1.id] }, O2);
assert(r.status === 201, "op2 给下级分 3");
// 自己发 2 个 → 恰好用满剩余(5-3=2)
r = await call("POST", "/admin/codes", { productId: P1.id, count: 2 }, O2);
assert(r.status === 201 && r.json?.codes?.length === 2, "op2 自己发 2 码（有效额度 5-3=2）OK");
// 再发 1 → 超（自己已发 2 = 有效额度）
r = await call("POST", "/admin/codes", { productId: P1.id, count: 1 }, O2);
assert(r.status === 403 && r.json?.message?.startsWith("quota_exceeded"), "op2 再自己发 1 应 403 quota_exceeded");
// 想再给下级分 1 → 也超（5 - 自己已发2 - 已分配3 = 0），证明自己发的码也占分配池
r = await call("POST", "/admin/accounts", { username: `e2${tag}`, password: "pass12", codeQuota: 1, productIds: [P1.id] }, O2);
assert(r.status === 403 && r.json?.message?.startsWith("quota_pool_exceeded"), "op2 自己发码占了池，再分配 1 应 403");

console.log(`OPERATOR ROLE E2E OK ✅  (${passed} assertions)`);
