import { decideActivation, normalizeCode, type CodeState } from "../core";
import type { LicenseRepo, TokenSigner } from "./ports";

export type ActivateResult =
  | { ok: true; token: string; expiresAt: number; reused: boolean }
  | { ok: false; reason: ActivateError };

export type ActivateError =
  | "product_not_found"
  | "code_not_found"
  | "disabled"
  | "expired"
  | "device_limit"
  | "revoked";

export type HeartbeatResult =
  | { ok: true; token: string; expiresAt: number }
  | { ok: false; reason: "product_not_found" | "not_activated" | "revoked" };

/**
 * 激活/心跳业务逻辑。只依赖 LicenseRepo + TokenSigner 端口，不碰 NestJS/Prisma。
 * Nest 模块用工厂把 Prisma 实现 + jose 签名器注进来。
 */
export class ActivationService {
  constructor(
    private readonly repo: LicenseRepo,
    private readonly signer: TokenSigner,
    private readonly now: () => number = Date.now,
  ) {}

  async activate(input: {
    productKey: string;
    code: string;
    deviceId: string;
    deviceName?: string;
  }): Promise<ActivateResult> {
    const product = await this.repo.findProductByKey(input.productKey);
    if (!product) return { ok: false, reason: "product_not_found" };

    const code = await this.repo.findCode(product.id, normalizeCode(input.code));
    if (!code) return { ok: false, reason: "code_not_found" };

    const bindings = await this.repo.listBindings(code.id);
    const state: CodeState = {
      status: code.status,
      maxDevices: code.maxDevices,
      expiresAt: code.expiresAt ? code.expiresAt.getTime() : null,
    };
    const decision = decideActivation(state, bindings, input.deviceId, this.now());
    if (!decision.ok) return { ok: false, reason: decision.reason };

    if (decision.reused) {
      await this.repo.touchBinding({ codeId: code.id, deviceId: input.deviceId });
    } else {
      await this.repo.bindDevice({
        codeId: code.id,
        productId: product.id,
        deviceId: input.deviceId,
        deviceName: input.deviceName,
      });
      await this.repo.markCodeActive(code.id);
    }
    await this.repo.logUsage({
      productId: product.id,
      deviceId: input.deviceId,
      event: "activate",
    });

    const { token, expiresAt } = await this.signer.sign({
      productKey: product.key,
      deviceId: input.deviceId,
      codeId: code.id,
    });
    return { ok: true, token, expiresAt, reused: decision.reused };
  }

  async heartbeat(input: { productKey: string; deviceId: string }): Promise<HeartbeatResult> {
    const product = await this.repo.findProductByKey(input.productKey);
    if (!product) return { ok: false, reason: "product_not_found" };

    const binding = await this.repo.findBinding(product.id, input.deviceId);
    if (!binding) return { ok: false, reason: "not_activated" };
    if (binding.revoked) return { ok: false, reason: "revoked" };

    await this.repo.touchBinding({ codeId: binding.codeId, deviceId: input.deviceId });
    await this.repo.logUsage({
      productId: product.id,
      deviceId: input.deviceId,
      event: "heartbeat",
    });

    const { token, expiresAt } = await this.signer.sign({
      productKey: product.key,
      deviceId: input.deviceId,
      codeId: binding.codeId,
    });
    return { ok: true, token, expiresAt };
  }
}
