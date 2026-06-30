import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import type { TokenSigner } from "../domain/ports";

/** TokenSigner 的 jose 实现：HS256 短期 JWT。 */
export class JoseTokenSigner implements TokenSigner {
  private readonly key: Uint8Array;
  constructor(secret: string, private readonly ttlSeconds = 3600) {
    this.key = new TextEncoder().encode(secret);
  }

  async sign(claims: {
    productKey: string;
    deviceId: string;
    codeId: string;
  }): Promise<{ token: string; expiresAt: number }> {
    const expSec = Math.floor(Date.now() / 1000) + this.ttlSeconds;
    const token = await new SignJWT({ ...claims })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(claims.deviceId)
      .setIssuedAt()
      .setExpirationTime(expSec)
      .sign(this.key);
    return { token, expiresAt: expSec * 1000 };
  }
}

/** 校验 license token，返回 payload；无效/过期抛错。 */
export async function verifyToken(secret: string, token: string): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
  return payload;
}
