import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import type { AdminRole, AdminTokenSigner } from "../domain/ports";

/** 管理端 JWT（HS256，claims 带 accountId+role）。 */
export class JoseAdminTokenSigner implements AdminTokenSigner {
  private readonly key: Uint8Array;
  constructor(secret: string, private readonly ttlSeconds = 12 * 3600) {
    this.key = new TextEncoder().encode(secret);
  }

  async sign(claims: { accountId: string; role: AdminRole }): Promise<{ token: string; expiresAt: number }> {
    const expSec = Math.floor(Date.now() / 1000) + this.ttlSeconds;
    const token = await new SignJWT({ role: claims.role })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(claims.accountId)
      .setIssuedAt()
      .setExpirationTime(expSec)
      .sign(this.key);
    return { token, expiresAt: expSec * 1000 };
  }
}

export interface AdminClaims extends JWTPayload {
  sub: string;
  role: AdminRole;
}

export async function verifyAdminToken(secret: string, token: string): Promise<AdminClaims> {
  const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
  return payload as AdminClaims;
}
