import type { PrismaClient } from "@prisma/client";
import type { DeviceBinding } from "../core";
import type { CodeRecord, LicenseRepo, ProductRecord } from "../domain/ports";

/** LicenseRepo 的 Prisma 实现（激活/心跳读写真库）。 */
export class PrismaLicenseRepo implements LicenseRepo {
  constructor(private readonly prisma: PrismaClient) {}

  async findProductByKey(key: string): Promise<ProductRecord | null> {
    return this.prisma.product.findUnique({ where: { key } });
  }

  async findCode(productId: string, normalizedCode: string): Promise<CodeRecord | null> {
    const c = await this.prisma.activationCode.findUnique({ where: { code: normalizedCode } });
    if (!c || c.productId !== productId) return null;
    return {
      id: c.id,
      productId: c.productId,
      status: c.status,
      maxDevices: c.maxDevices,
      expiresAt: c.expiresAt,
    };
  }

  async listBindings(codeId: string): Promise<DeviceBinding[]> {
    const bs = await this.prisma.deviceActivation.findMany({ where: { codeId } });
    return bs.map((b) => ({ deviceId: b.deviceId, revoked: b.revoked }));
  }

  async bindDevice(input: {
    codeId: string;
    productId: string;
    deviceId: string;
    deviceName?: string;
  }): Promise<void> {
    await this.prisma.deviceActivation.create({
      data: {
        codeId: input.codeId,
        productId: input.productId,
        deviceId: input.deviceId,
        deviceName: input.deviceName ?? null,
      },
    });
  }

  async touchBinding(input: { codeId: string; deviceId: string }): Promise<void> {
    await this.prisma.deviceActivation.updateMany({
      where: { codeId: input.codeId, deviceId: input.deviceId },
      data: { lastHeartbeatAt: new Date() },
    });
  }

  async markCodeActive(codeId: string): Promise<void> {
    await this.prisma.activationCode.update({ where: { id: codeId }, data: { status: "ACTIVE" } });
  }

  async findBinding(
    productId: string,
    deviceId: string,
  ): Promise<{ codeId: string; revoked: boolean } | null> {
    const b = await this.prisma.deviceActivation.findFirst({ where: { productId, deviceId } });
    return b ? { codeId: b.codeId, revoked: b.revoked } : null;
  }

  async logUsage(input: { productId: string; deviceId: string; event: string }): Promise<void> {
    await this.prisma.usageLog.create({ data: input });
  }
}
