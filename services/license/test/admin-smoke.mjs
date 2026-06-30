// 管理端 e2e：seed 管理员 → 登录 → 建产品 → 发码 → 列码 → 停用 → 封设备；含 401 负例。
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const PORT = process.env.PORT ?? 3009;
const base = `http://localhost:${PORT}`;

await prisma.usageLog.deleteMany();
await prisma.deviceActivation.deleteMany();
await prisma.activationCode.deleteMany();
await prisma.product.deleteMany();
await prisma.account.deleteMany();
await prisma.account.create({
  data: { username: "root", passwordHash: await bcrypt.hash("rootpw", 10), role: "ADMIN" },
});
await prisma.$disconnect();

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}
const j = async (res) => ({ status: res.status, body: await res.json().catch(() => null) });

// 登录
let r = await j(
  await fetch(`${base}/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "root", password: "rootpw" }),
  }),
);
console.log("login:", r.status);
assert(r.status === 201 && r.body?.token, "login 应 201 带 token");
const H = { "content-type": "application/json", authorization: `Bearer ${r.body.token}` };

// 错密码 → 401
const bad = await fetch(`${base}/admin/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: "root", password: "x" }),
});
assert(bad.status === 401, "错密码应 401");

// 无 token 访问 admin → 401
const noTok = await fetch(`${base}/admin/products`);
assert(noTok.status === 401, "无 token 应 401");

// 建产品
r = await j(
  await fetch(`${base}/admin/products`, { method: "POST", headers: H, body: JSON.stringify({ name: "autotk" }) }),
);
console.log("create product:", r.status, r.body?.key);
assert(r.status === 201 && r.body?.key && r.body?.secret, "建产品应返回 key+secret");
const productId = r.body.id;

// 发码
r = await j(
  await fetch(`${base}/admin/codes`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ productId, count: 3, maxDevices: 2 }),
  }),
);
console.log("issue codes:", r.status, r.body?.codes?.length);
assert(r.status === 201 && r.body?.codes?.length === 3, "应发 3 个码");

// 列码
r = await j(await fetch(`${base}/admin/codes?productId=${productId}`, { headers: H }));
console.log("list codes:", r.status, r.body?.length);
assert(r.status === 200 && r.body?.length === 3, "应列出 3 个码");
assert(r.body[0].devices === 0, "新码设备数应为 0");
const codeId = r.body[0].id;

// 停用
r = await j(await fetch(`${base}/admin/codes/${codeId}/disable`, { method: "POST", headers: H }));
assert(r.status === 201 && r.body?.ok, "停用应 ok");

// 封设备
r = await j(
  await fetch(`${base}/admin/devices/revoke`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ codeId, deviceId: "dev1" }),
  }),
);
assert(r.status === 201 && r.body?.ok, "封设备应 ok");

console.log("ADMIN SMOKE OK ✅");
