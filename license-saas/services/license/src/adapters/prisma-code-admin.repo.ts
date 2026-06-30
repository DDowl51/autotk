import type { PrismaClient } from "@prisma/client";
import type { CodeAdminRepo } from "../domain/ports";

/** CodeAdminRepo 的 Prisma 实现（发码/停用/封设备写真库）。 */
export class PrismaCodeAdminRepo implements CodeAdminRepo {
  constructor(private readonly prisma: PrismaClient) {}

  async codeExists(normalizedCode: string): Promise<boolean> {
    const c = await this.prisma.activationCode.findUnique({ where: { code: normalizedCode } });
    return c !== null;
  }

  async countCodesByOwner(ownerId: string): Promise<number> {
    return this.prisma.activationCode.count({ where: { ownerId } });
  }

  async createCode(input: {
    code: string;
    productId: string;
    ownerId?: string;
    maxDevices: number;
    expiresAt: Date | null;
  }): Promise<void> {
    await this.prisma.activationCode.create({
      data: {
        code: input.code,
        productId: input.productId,
        ownerId: input.ownerId ?? null,
        maxDevices: input.maxDevices,
        expiresAt: input.expiresAt,
      },
    });
  }

  async setCodeStatus(codeId: string, status: "ACTIVE" | "DISABLED"): Promise<void> {
    await this.prisma.activationCode.update({ where: { id: codeId }, data: { status } });
  }

  async revokeBinding(codeId: string, deviceId: string): Promise<void> {
    await this.prisma.deviceActivation.updateMany({
      where: { codeId, deviceId },
      data: { revoked: true },
    });
  }
}
