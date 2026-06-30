import test from "node:test";
import assert from "node:assert/strict";
import { CodeAdminService, QuotaExceededError } from "../src/domain/code-admin.service";
import type { CodeAdminRepo } from "../src/domain/ports";

function makeRepo(existing: string[] = [], ownerCount = 0) {
  const created: { code: string; maxDevices: number; expiresAt: Date | null }[] = [];
  const exists = new Set(existing);
  const statuses: Record<string, string> = {};
  const revoked: string[] = [];
  const repo: CodeAdminRepo = {
    codeExists: async (c) => exists.has(c),
    countCodesByOwner: async () => ownerCount,
    createCode: async (i) => {
      created.push({ code: i.code, maxDevices: i.maxDevices, expiresAt: i.expiresAt });
      exists.add(i.code);
    },
    setCodeStatus: async (id, s) => {
      statuses[id] = s;
    },
    revokeBinding: async (codeId, deviceId) => {
      revoked.push(`${codeId}:${deviceId}`);
    },
  };
  return { repo, created, statuses, revoked };
}

test("issueCodes: 批量发码，规范化入库、带分隔符返回、maxDevices 生效", async () => {
  const r = makeRepo();
  const svc = new CodeAdminService(r.repo);
  const codes = await svc.issueCodes({ productId: "p1", count: 3, maxDevices: 5 });
  assert.equal(codes.length, 3);
  assert.equal(r.created.length, 3);
  for (const c of codes) assert.match(c, /^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/);
  for (const c of r.created) {
    assert.match(c.code, /^[A-Z0-9]{16}$/, "入库应为规范化无分隔");
    assert.equal(c.maxDevices, 5);
  }
});

test("issueCodes: 撞库重试取下一个", async () => {
  // 第一次生成的码已存在 → 应重试用第二个。
  const r = makeRepo(["AAAAAAAAAAAAAAAA"]);
  let n = 0;
  const gen = () => (n++ === 0 ? "AAAA-AAAA-AAAA-AAAA" : "BBBB-BBBB-BBBB-BBBB");
  const svc = new CodeAdminService(r.repo, gen);
  const codes = await svc.issueCodes({ productId: "p1", count: 1 });
  assert.deepEqual(codes, ["BBBB-BBBB-BBBB-BBBB"]);
  assert.equal(r.created[0].code, "BBBBBBBBBBBBBBBB");
});

test("issueCodes: count<1 返回空", async () => {
  const r = makeRepo();
  const svc = new CodeAdminService(r.repo);
  assert.deepEqual(await svc.issueCodes({ productId: "p1", count: 0 }), []);
});

test("issueCodes: 配额内通过", async () => {
  const r = makeRepo([], 3); // 已发 3
  const svc = new CodeAdminService(r.repo);
  const codes = await svc.issueCodes({ productId: "p1", ownerId: "u1", count: 2, quota: 5 });
  assert.equal(codes.length, 2); // 3+2=5 <= 5
});

test("issueCodes: 超配额抛 QuotaExceededError，不发码", async () => {
  const r = makeRepo([], 4); // 已发 4
  const svc = new CodeAdminService(r.repo);
  await assert.rejects(
    () => svc.issueCodes({ productId: "p1", ownerId: "u1", count: 2, quota: 5 }),
    QuotaExceededError,
  );
  assert.equal(r.created.length, 0);
});

test("issueCodes: quota=null 不限", async () => {
  const r = makeRepo([], 999);
  const svc = new CodeAdminService(r.repo);
  const codes = await svc.issueCodes({ productId: "p1", ownerId: "u1", count: 3, quota: null });
  assert.equal(codes.length, 3);
});

test("disableCode / revokeDevice", async () => {
  const r = makeRepo();
  const svc = new CodeAdminService(r.repo);
  await svc.disableCode("c1");
  assert.equal(r.statuses["c1"], "DISABLED");
  await svc.revokeDevice("c1", "dev9");
  assert.deepEqual(r.revoked, ["c1:dev9"]);
});
