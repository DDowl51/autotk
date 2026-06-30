import { generateCode, normalizeCode, formatCode } from "../core";
import type { CodeAdminRepo } from "./ports";

/** 配额超限错误（经销商发码超过额度）。 */
export class QuotaExceededError extends Error {
  constructor(
    readonly used: number,
    readonly quota: number,
    readonly requested: number,
  ) {
    super("quota_exceeded");
    this.name = "QuotaExceededError";
  }
}

/** 管理端：批量发码、停用码、远程封设备。只依赖 CodeAdminRepo 端口。 */
export class CodeAdminService {
  constructor(
    private readonly repo: CodeAdminRepo,
    private readonly gen: () => string = generateCode,
  ) {}

  /**
   * 批量发码，返回带分隔符的展示码。发码去重（撞库重试）。
   * 传 quota（非 null）时按 ownerId 已发码数 + 本次 count 校验配额，超限抛 QuotaExceededError。
   */
  async issueCodes(input: {
    productId: string;
    ownerId?: string;
    count: number;
    maxDevices?: number;
    expiresAt?: Date | null;
    quota?: number | null;
  }): Promise<string[]> {
    if (input.count < 1) return [];
    if (input.quota != null && input.ownerId) {
      const used = await this.repo.countCodesByOwner(input.ownerId);
      if (used + input.count > input.quota) {
        throw new QuotaExceededError(used, input.quota, input.count);
      }
    }
    const out: string[] = [];
    for (let i = 0; i < input.count; i++) {
      let norm = normalizeCode(this.gen());
      let tries = 0;
      while (await this.repo.codeExists(norm)) {
        if (++tries > 5) throw new Error("发码连续撞库，重试失败");
        norm = normalizeCode(this.gen());
      }
      await this.repo.createCode({
        code: norm,
        productId: input.productId,
        ownerId: input.ownerId,
        maxDevices: input.maxDevices ?? 1,
        expiresAt: input.expiresAt ?? null,
      });
      out.push(formatCode(norm));
    }
    return out;
  }

  disableCode(codeId: string): Promise<void> {
    return this.repo.setCodeStatus(codeId, "DISABLED");
  }

  revokeDevice(codeId: string, deviceId: string): Promise<void> {
    return this.repo.revokeBinding(codeId, deviceId);
  }
}
