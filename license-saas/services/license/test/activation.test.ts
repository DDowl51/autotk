import test from "node:test";
import assert from "node:assert/strict";
import { ActivationService } from "../src/domain/activation.service";
import type {
  LicenseRepo,
  TokenSigner,
  ProductRecord,
  CodeRecord,
} from "../src/domain/ports";
import type { DeviceBinding } from "../src/core";

const product: ProductRecord = { id: "p1", key: "autotk", secret: "s" };
const mkCode = (over: Partial<CodeRecord> = {}): CodeRecord => ({
  id: "c1",
  productId: "p1",
  status: "ACTIVE",
  maxDevices: 2,
  expiresAt: null,
  ...over,
});

const signer: TokenSigner = {
  sign: async ({ deviceId }) => ({ token: "tok-" + deviceId, expiresAt: 9999 }),
};

function makeRepo(seed: {
  product?: ProductRecord | null;
  code?: CodeRecord | null;
  bindings?: DeviceBinding[];
}) {
  const bindings: DeviceBinding[] = [...(seed.bindings ?? [])];
  const log: string[] = [];
  const state = { codeActive: false };
  const repo: LicenseRepo = {
    findProductByKey: async (key) =>
      seed.product && seed.product.key === key ? seed.product : null,
    findCode: async () => seed.code ?? null,
    listBindings: async () => bindings,
    bindDevice: async ({ deviceId }) => {
      bindings.push({ deviceId, revoked: false });
    },
    touchBinding: async () => {},
    markCodeActive: async () => {
      state.codeActive = true;
    },
    findBinding: async (_p, deviceId) => {
      const b = bindings.find((x) => x.deviceId === deviceId);
      return b ? { codeId: seed.code?.id ?? "c1", revoked: b.revoked } : null;
    },
    logUsage: async ({ event }) => {
      log.push(event);
    },
  };
  return { repo, bindings, log, state };
}

test("activate: 新设备成功，绑定+激活码+记日志", async () => {
  const r = makeRepo({ product, code: mkCode() });
  const svc = new ActivationService(r.repo, signer);
  const res = await svc.activate({ productKey: "autotk", code: "ab-cd", deviceId: "d1" });
  assert.deepEqual(res, { ok: true, token: "tok-d1", expiresAt: 9999, reused: false });
  assert.equal(r.bindings.length, 1);
  assert.equal(r.state.codeActive, true);
  assert.deepEqual(r.log, ["activate"]);
});

test("activate: 老设备重激活 reused=true，不新增绑定", async () => {
  const r = makeRepo({ product, code: mkCode(), bindings: [{ deviceId: "d1", revoked: false }] });
  const svc = new ActivationService(r.repo, signer);
  const res = await svc.activate({ productKey: "autotk", code: "x", deviceId: "d1" });
  assert.ok(res.ok && res.reused === true);
  assert.equal(r.bindings.length, 1);
});

test("activate: 超设备数 → device_limit", async () => {
  const r = makeRepo({
    product,
    code: mkCode({ maxDevices: 2 }),
    bindings: [
      { deviceId: "a", revoked: false },
      { deviceId: "b", revoked: false },
    ],
  });
  const svc = new ActivationService(r.repo, signer);
  const res = await svc.activate({ productKey: "autotk", code: "x", deviceId: "d3" });
  assert.deepEqual(res, { ok: false, reason: "device_limit" });
});

test("activate: 未知产品/未知码/停用/过期", async () => {
  const svc1 = new ActivationService(makeRepo({ product: null }).repo, signer);
  assert.deepEqual(await svc1.activate({ productKey: "x", code: "y", deviceId: "d" }), {
    ok: false,
    reason: "product_not_found",
  });

  const svc2 = new ActivationService(makeRepo({ product, code: null }).repo, signer);
  assert.deepEqual(await svc2.activate({ productKey: "autotk", code: "y", deviceId: "d" }), {
    ok: false,
    reason: "code_not_found",
  });

  const svc3 = new ActivationService(
    makeRepo({ product, code: mkCode({ status: "DISABLED" }) }).repo,
    signer,
  );
  assert.deepEqual(await svc3.activate({ productKey: "autotk", code: "y", deviceId: "d" }), {
    ok: false,
    reason: "disabled",
  });

  const svc4 = new ActivationService(
    makeRepo({ product, code: mkCode({ expiresAt: new Date(1000) }) }).repo,
    signer,
    () => 2000,
  );
  assert.deepEqual(await svc4.activate({ productKey: "autotk", code: "y", deviceId: "d" }), {
    ok: false,
    reason: "expired",
  });
});

test("heartbeat: 未激活/被封/成功", async () => {
  const notAct = new ActivationService(makeRepo({ product, code: mkCode() }).repo, signer);
  assert.deepEqual(await notAct.heartbeat({ productKey: "autotk", deviceId: "d1" }), {
    ok: false,
    reason: "not_activated",
  });

  const revoked = new ActivationService(
    makeRepo({ product, code: mkCode(), bindings: [{ deviceId: "d1", revoked: true }] }).repo,
    signer,
  );
  assert.deepEqual(await revoked.heartbeat({ productKey: "autotk", deviceId: "d1" }), {
    ok: false,
    reason: "revoked",
  });

  const ok = new ActivationService(
    makeRepo({ product, code: mkCode(), bindings: [{ deviceId: "d1", revoked: false }] }).repo,
    signer,
  );
  const res = await ok.heartbeat({ productKey: "autotk", deviceId: "d1" });
  assert.ok(res.ok && res.token === "tok-d1");
});
