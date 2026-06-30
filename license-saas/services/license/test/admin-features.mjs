// 新管理端功能 e2e：账号管理、分销配额发码、编辑、批量停用、重置 secret、改密。
// 假设服务已在 PORT 运行，且已 seed 管理员 admin/admin123。
const PORT = process.env.PORT ?? 3009;
const base = `http://localhost:${PORT}`;

function assert(cond, msg) {
  if (!cond) {
    console.error("ADMIN-FEATURES FAIL:", msg);
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

// 1. 管理员登录
let r = await call("POST", "/admin/login", { username: "admin", password: "admin123" });
assert(r.status === 201 && r.json?.token, "admin 登录");
const A = r.json.token;

// 2. /me
r = await call("GET", "/admin/me", undefined, A);
assert(r.json?.role === "ADMIN", "/me 应为 ADMIN");

// 3. 建产品
r = await call("POST", "/admin/products", { name: "feat-" + Date.now() }, A);
assert(r.status === 201 && r.json?.id && r.json?.secret, "建产品");
const productId = r.json.id;
const secret1 = r.json.secret;

// 4. 建分销（配额 2，授权可见本产品）
const ruser = "r" + Date.now();
r = await call("POST", "/admin/accounts", { username: ruser, password: "resel123", codeQuota: 2, role: "USER", productIds: [productId] }, A);
assert(r.status === 201 && r.json?.id, "建分销账号");
const resellerId = r.json.id;

// 5. 分销登录
r = await call("POST", "/admin/login", { username: ruser, password: "resel123" });
assert(r.status === 201 && r.json?.role === "USER", "分销登录应为 USER");
const R = r.json.token;

// 6. 分销 /me 看配额
r = await call("GET", "/admin/me", undefined, R);
assert(r.json?.codeQuota === 2 && r.json?.used === 0, "分销配额应为 2，已用 0");

// 7. 配额内发 2 个
r = await call("POST", "/admin/codes", { productId, count: 2, maxDevices: 1 }, R);
assert(r.status === 201 && r.json?.codes?.length === 2, "配额内发 2 个");

// 8. 再发 1 个 → 超额被拒
r = await call("POST", "/admin/codes", { productId, count: 1, maxDevices: 1 }, R);
assert(r.status === 403, "超额应 403，实得 " + r.status);
console.log("quota over →", r.status, r.json?.message);

// 9. 分销只看到自己的 2 个
r = await call("GET", "/admin/codes", undefined, R);
assert(r.json?.length === 2, "分销应只看到自己的 2 个码");
assert(r.json.every((c) => c.productName), "应带产品名");

// 10. 管理员看到这些码且带归属
r = await call("GET", `/admin/codes?productId=${productId}`, undefined, A);
assert(r.json?.length === 2 && r.json.every((c) => c.ownerName === ruser), "管理员应看到 ownerName=" + ruser);
const ids = r.json.map((c) => c.id);

// 11. 编辑：改 maxDevices
r = await call("PATCH", `/admin/codes/${ids[0]}`, { maxDevices: 5 }, A);
assert(r.status === 200, "编辑应 200");
r = await call("GET", `/admin/codes?productId=${productId}`, undefined, A);
assert(r.json.find((c) => c.id === ids[0])?.maxDevices === 5, "maxDevices 应更新为 5");

// 12. 批量停用
r = await call("POST", "/admin/codes/batch/disable", { ids }, A);
assert(r.status === 201 && r.json?.count === 2, "批量停用 2 个");
r = await call("GET", `/admin/codes?productId=${productId}`, undefined, A);
assert(r.json.every((c) => c.status === "DISABLED"), "两个码应都 DISABLED");

// 13. 重置 secret
r = await call("POST", `/admin/products/${productId}/regenerate-secret`, {}, A);
assert(r.status === 201 && r.json?.secret && r.json.secret !== secret1, "重置后 secret 应变化");

// 14. 重置分销密码 → 新密码可登录
r = await call("POST", `/admin/accounts/${resellerId}/password`, { newPassword: "newpass123" }, A);
assert(r.status === 201, "重置密码");
r = await call("POST", "/admin/login", { username: ruser, password: "newpass123" });
assert(r.status === 201 && r.json?.token, "新密码应能登录");

// 15. 无 token 访问 → 401
r = await call("GET", "/admin/accounts");
assert(r.status === 401, "无 token 访问 accounts 应 401");

// 16. 分销自助改密（/me/password）：旧密码错→400；对→ok；新密码可登录
//     注：#14 管理员已把该分销密码重置为 newpass123。
r = await call("POST", "/admin/me/password", { oldPassword: "wrong", newPassword: "x123456" }, R);
assert(r.status === 400, "旧密码错应 400");
r = await call("POST", "/admin/me/password", { oldPassword: "newpass123", newPassword: "selfpw123" }, R);
assert(r.status === 201 && r.json?.ok, "自助改密应成功");
r = await call("POST", "/admin/login", { username: ruser, password: "selfpw123" });
assert(r.status === 201, "自助改密后新密码可登录");

// 17. 分销不能建产品 → 403
r = await call("POST", "/admin/products", { name: "nope" }, R);
assert(r.status === 403, "分销建产品应 403");

// 18. 管理员停用账号 → 登录被拒
r = await call("POST", `/admin/accounts/${resellerId}`, { disabled: true }, A);
assert(r.status === 201, "停用账号");
r = await call("POST", "/admin/login", { username: ruser, password: "selfpw123" });
assert(r.status === 401, "停用后登录应 401");

// 19. 用量统计：结构 + 天数 + 全局总数
r = await call("GET", "/admin/stats?days=30", undefined, A);
assert(r.status === 200, "stats 应 200");
assert(r.json?.totals && Array.isArray(r.json?.statusCounts), "stats 含 totals + statusCounts");
assert(Array.isArray(r.json?.issuedByDay) && r.json.issuedByDay.length === 30, "issuedByDay 应 30 天");
assert(Array.isArray(r.json?.activatedByDay) && r.json.activatedByDay.length === 30, "activatedByDay 应 30 天");

console.log("ADMIN FEATURES E2E OK ✅");
