// 真 e2e 冒烟：seed 产品+码 → 对运行中的服务发签名请求 → 验 activate/heartbeat/坏签名。
import { PrismaClient } from "@prisma/client";
import { createHmac } from "node:crypto";

const prisma = new PrismaClient();
const KEY = "autotk";
const SECRET = "psecret";
const PORT = process.env.PORT ?? 3009;

await prisma.usageLog.deleteMany();
await prisma.deviceActivation.deleteMany();
await prisma.activationCode.deleteMany();
await prisma.product.deleteMany();
await prisma.product.create({ data: { key: KEY, secret: SECRET, name: "autotk" } });
await prisma.activationCode.create({
  data: { code: "TESTTESTTESTTEST", product: { connect: { key: KEY } }, maxDevices: 2 },
});
await prisma.$disconnect();

function signedHeaders(body) {
  const timestamp = Date.now();
  const nonce = "n" + timestamp;
  const sig = createHmac("sha256", SECRET)
    .update(`${KEY}\n${timestamp}\n${nonce}\n${body}`)
    .digest("hex");
  return {
    "content-type": "application/json",
    "x-product-key": KEY,
    "x-timestamp": String(timestamp),
    "x-nonce": nonce,
    "x-signature": sig,
  };
}

async function post(path, obj) {
  const body = JSON.stringify(obj);
  const r = await fetch(`http://localhost:${PORT}/${path}`, {
    method: "POST",
    headers: signedHeaders(body),
    body,
  });
  return { status: r.status, json: await r.json().catch(() => null) };
}

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

const act = await post("v1/activate", { code: "TEST-TEST-TEST-TEST", deviceId: "devSmoke" });
console.log("activate:", act.status, JSON.stringify(act.json));
assert(act.status === 201 && act.json?.token, "activate 应 201 带 token");

const hb = await post("v1/heartbeat", { deviceId: "devSmoke" });
console.log("heartbeat:", hb.status, JSON.stringify(hb.json));
assert(hb.status === 201 && hb.json?.token, "heartbeat 应 201 带 token");

// 坏签名 → 401
const body = JSON.stringify({ code: "TEST-TEST-TEST-TEST", deviceId: "devX" });
const bad = await fetch(`http://localhost:${PORT}/v1/activate`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-product-key": KEY,
    "x-timestamp": String(Date.now()),
    "x-nonce": "n",
    "x-signature": "deadbeef",
  },
  body,
});
console.log("bad-sig status:", bad.status);
assert(bad.status === 401, "坏签名应 401");

console.log("SMOKE OK ✅");
