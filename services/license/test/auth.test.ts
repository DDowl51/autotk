import test from "node:test";
import assert from "node:assert/strict";
import { AuthService } from "../src/domain/auth.service";
import { generateProductKey, generateSecret } from "../src/core";
import type { AccountRepo, AdminTokenSigner, PasswordVerifier } from "../src/domain/ports";

const signer: AdminTokenSigner = {
  sign: async ({ accountId, role }) => ({ token: `t-${accountId}-${role}`, expiresAt: 9999 }),
};
const passwords: PasswordVerifier = {
  verify: async (plain, hash) => hash === "hash:" + plain,
};
function repo(
  account: { id: string; username: string; pw: string; role: "ADMIN" | "USER"; disabled?: boolean } | null,
): AccountRepo {
  return {
    findByUsername: async (u) =>
      account && account.username === u
        ? {
            id: account.id,
            username: account.username,
            passwordHash: "hash:" + account.pw,
            role: account.role,
            disabled: account.disabled ?? false,
          }
        : null,
  };
}

test("login: 成功返回 token + role", async () => {
  const svc = new AuthService(repo({ id: "a1", username: "admin", pw: "pw", role: "ADMIN" }), passwords, signer);
  const r = await svc.login("admin", "pw");
  assert.deepEqual(r, { ok: true, token: "t-a1-ADMIN", expiresAt: 9999, role: "ADMIN" });
});

test("login: 用户不存在 / 密码错 → ok:false", async () => {
  const svc = new AuthService(repo({ id: "a1", username: "admin", pw: "pw", role: "ADMIN" }), passwords, signer);
  assert.deepEqual(await svc.login("nope", "pw"), { ok: false });
  assert.deepEqual(await svc.login("admin", "wrong"), { ok: false });
});

test("login: 停用账号 → ok:false（即使密码对）", async () => {
  const svc = new AuthService(
    repo({ id: "a1", username: "u", pw: "pw", role: "USER", disabled: true }),
    passwords,
    signer,
  );
  assert.deepEqual(await svc.login("u", "pw"), { ok: false });
});

test("产品 key/secret 生成：格式 + 唯一", () => {
  assert.match(generateProductKey(), /^prod_[0-9a-f]{16}$/);
  assert.notEqual(generateProductKey(), generateProductKey());
  assert.match(generateSecret(), /^[0-9a-f]{64}$/);
  assert.notEqual(generateSecret(), generateSecret());
});
