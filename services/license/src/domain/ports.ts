import type { DeviceBinding } from "../core";

// 业务逻辑依赖的端口（接口）。Prisma 实现这些；测试用内存假实现。
// 这样 ActivationService 不直接依赖 Prisma/NestJS，可纯单测。

export interface ProductRecord {
  id: string;
  key: string;
  secret: string;
}

export interface CodeRecord {
  id: string;
  productId: string;
  status: "UNUSED" | "ACTIVE" | "DISABLED";
  maxDevices: number;
  expiresAt: Date | null;
}

export interface LicenseRepo {
  findProductByKey(key: string): Promise<ProductRecord | null>;
  /** 按规范化后的码在某产品下查码。 */
  findCode(productId: string, normalizedCode: string): Promise<CodeRecord | null>;
  listBindings(codeId: string): Promise<DeviceBinding[]>;
  /** 新设备绑定。 */
  bindDevice(input: {
    codeId: string;
    productId: string;
    deviceId: string;
    deviceName?: string;
  }): Promise<void>;
  /** 老设备重激活/心跳：更新 lastHeartbeatAt。 */
  touchBinding(input: { codeId: string; deviceId: string }): Promise<void>;
  markCodeActive(codeId: string): Promise<void>;
  /** 心跳用：按产品+设备找绑定。 */
  findBinding(
    productId: string,
    deviceId: string,
  ): Promise<{ codeId: string; revoked: boolean } | null>;
  logUsage(input: { productId: string; deviceId: string; event: string }): Promise<void>;
}

export interface CodeAdminRepo {
  /** 规范化后的码是否已存在（发码去重）。 */
  codeExists(normalizedCode: string): Promise<boolean>;
  /** 某账号名下已发码数（配额校验用）。 */
  countCodesByOwner(ownerId: string): Promise<number>;
  createCode(input: {
    code: string; // 规范化后
    productId: string;
    ownerId?: string;
    maxDevices: number;
    expiresAt: Date | null;
  }): Promise<void>;
  setCodeStatus(codeId: string, status: "ACTIVE" | "DISABLED"): Promise<void>;
  /** 远程封禁某码下的某设备。 */
  revokeBinding(codeId: string, deviceId: string): Promise<void>;
}

export interface TokenSigner {
  sign(claims: {
    productKey: string;
    deviceId: string;
    codeId: string;
  }): Promise<{ token: string; expiresAt: number }>;
}

export type AdminRole = "ADMIN" | "OPERATOR" | "USER";

export interface AccountRecord {
  id: string;
  username: string;
  passwordHash: string;
  role: AdminRole;
  disabled: boolean;
}

export interface AccountRepo {
  findByUsername(username: string): Promise<AccountRecord | null>;
}

export interface PasswordVerifier {
  verify(plain: string, hash: string): Promise<boolean>;
}

export interface AdminTokenSigner {
  sign(claims: { accountId: string; role: AdminRole }): Promise<{ token: string; expiresAt: number }>;
}
