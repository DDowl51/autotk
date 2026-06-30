import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaLicenseRepo } from "../../src/adapters/prisma-license.repo";
import { PrismaCodeAdminRepo } from "../../src/adapters/prisma-code-admin.repo";
import { JoseTokenSigner, verifyToken } from "../../src/adapters/jose-signer";
import { hashPassword, verifyPassword } from "../../src/adapters/password";
import { ActivationService } from "../../src/domain/activation.service";
import { CodeAdminService } from "../../src/domain/code-admin.service";

const prisma = new PrismaClient();
const JWT = "test-jwt-secret";

beforeAll(async () => {
  await prisma.$connect();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await prisma.usageLog.deleteMany();
  await prisma.deviceActivation.deleteMany();
  await prisma.activationCode.deleteMany();
  await prisma.product.deleteMany();
  await prisma.account.deleteMany();
});

describe("license 集成（真 postgres）", () => {
  it("发码 → 激活 → 超限 → 心跳 → 远程封禁 全链路", async () => {
    const product = await prisma.product.create({
      data: { key: "autotk", secret: "psecret", name: "autotk" },
    });

    const admin = new CodeAdminService(new PrismaCodeAdminRepo(prisma));
    const [shown] = await admin.issueCodes({ productId: product.id, count: 1, maxDevices: 1 });
    expect(shown).toMatch(/^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/);

    const svc = new ActivationService(new PrismaLicenseRepo(prisma), new JoseTokenSigner(JWT));

    // 激活成功
    const r1 = await svc.activate({ productKey: "autotk", code: shown, deviceId: "devA" });
    expect(r1.ok).toBe(true);
    if (r1.ok) {
      const claims = await verifyToken(JWT, r1.token);
      expect(claims.deviceId).toBe("devA");
      expect(r1.reused).toBe(false);
    }
    expect(await prisma.deviceActivation.count()).toBe(1);
    const code = await prisma.activationCode.findFirstOrThrow();
    expect(code.status).toBe("ACTIVE");

    // 老设备重激活 → reused
    const rReuse = await svc.activate({ productKey: "autotk", code: shown, deviceId: "devA" });
    expect(rReuse.ok && rReuse.reused).toBe(true);
    expect(await prisma.deviceActivation.count()).toBe(1);

    // 第二台超限（maxDevices=1）
    const r2 = await svc.activate({ productKey: "autotk", code: shown, deviceId: "devB" });
    expect(r2).toEqual({ ok: false, reason: "device_limit" });

    // 心跳 OK
    const h1 = await svc.heartbeat({ productKey: "autotk", deviceId: "devA" });
    expect(h1.ok).toBe(true);

    // 远程封禁 devA → 心跳被拒
    await admin.revokeDevice(code.id, "devA");
    const h2 = await svc.heartbeat({ productKey: "autotk", deviceId: "devA" });
    expect(h2).toEqual({ ok: false, reason: "revoked" });

    // 用量日志有记录
    expect(await prisma.usageLog.count()).toBeGreaterThan(0);
  });

  it("未知码 / 停用码", async () => {
    const product = await prisma.product.create({
      data: { key: "autotk", secret: "s", name: "autotk" },
    });
    const svc = new ActivationService(new PrismaLicenseRepo(prisma), new JoseTokenSigner(JWT));

    expect(await svc.activate({ productKey: "autotk", code: "ZZZZ-ZZZZ", deviceId: "d" })).toEqual({
      ok: false,
      reason: "code_not_found",
    });

    const admin = new CodeAdminService(new PrismaCodeAdminRepo(prisma));
    const [shown] = await admin.issueCodes({ productId: product.id, count: 1 });
    const c = await prisma.activationCode.findFirstOrThrow();
    await admin.disableCode(c.id);
    expect(await svc.activate({ productKey: "autotk", code: shown, deviceId: "d" })).toEqual({
      ok: false,
      reason: "disabled",
    });
  });

  it("密码哈希 round-trip", async () => {
    const h = await hashPassword("s3cret");
    expect(await verifyPassword("s3cret", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
  });
});
