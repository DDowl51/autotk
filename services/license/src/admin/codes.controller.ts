import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { CodeAdminService, QuotaExceededError } from "../domain/code-admin.service";
import { PrismaService } from "../prisma/prisma.service";
import { formatCode, isProductAllowed, selfIssuableQuota, type Role } from "../core";
import { AdminJwtGuard, type RequestWithAccount } from "./admin-jwt.guard";
import { batchDisableSchema, codePatchSchema, issueSchema, revokeSchema } from "./dto";
import { track } from "../telemetry";

@Controller("admin")
@UseGuards(AdminJwtGuard)
export class CodesController {
  constructor(
    private readonly codes: CodeAdminService,
    private readonly prisma: PrismaService,
  ) {}

  @Get("codes")
  async list(@Req() req: RequestWithAccount, @Query("productId") productId?: string) {
    const admin = req.account!.role === "ADMIN";
    const where: {
      productId?: string;
      ownerId?: string;
      product?: { allowedBy: { some: { accountId: string } } };
    } = {};
    if (productId) where.productId = productId;
    if (!admin) {
      where.ownerId = req.account!.id; // USER 只看自己的
      // 连带隐藏：白名单外（含被移除）产品的码不出现在分销视图。
      where.product = { allowedBy: { some: { accountId: req.account!.id } } };
    }

    const rows = await this.prisma.activationCode.findMany({
      where,
      include: {
        _count: { select: { activations: true } },
        product: { select: { name: true } },
        owner: { select: { username: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    return rows.map((c) => ({
      id: c.id,
      code: formatCode(c.code),
      status: c.status,
      maxDevices: c.maxDevices,
      expiresAt: c.expiresAt,
      note: c.note,
      devices: c._count.activations,
      productId: c.productId,
      productName: c.product.name,
      ownerName: admin ? (c.owner?.username ?? null) : undefined,
    }));
  }

  @Post("codes")
  async issue(@Req() req: RequestWithAccount, @Body() body: unknown) {
    const dto = issueSchema.parse(body);
    const admin = req.account!.role === "ADMIN";
    let ownerId = dto.ownerId;
    let quota: number | null | undefined;
    if (!admin) {
      ownerId = req.account!.id; // 强制归属本人
      const me = await this.prisma.account.findUnique({
        where: { id: req.account!.id },
        include: { allowedProducts: { select: { productId: true } } },
      });
      // 额度池：运营「自己发码」与「分给下级的额度」共用总预算，
      // 有效额度 = 总预算 - 已分配给下级之和。普通分销无下级，扣减为 0（行为不变）。
      const alloc = await this.prisma.account.aggregate({
        _sum: { codeQuota: true },
        where: { createdById: req.account!.id },
      });
      quota = selfIssuableQuota(me?.codeQuota ?? null, alloc._sum.codeQuota ?? 0);
      // 分销/运营只能对白名单内产品发码。
      const allowed = me?.allowedProducts.map((p) => p.productId) ?? [];
      if (!isProductAllowed(req.account!.role as Role, allowed, dto.productId)) {
        throw new ForbiddenException("product_not_allowed");
      }
    }
    try {
      const codes = await this.codes.issueCodes({
        productId: dto.productId,
        count: dto.count,
        maxDevices: dto.maxDevices,
        ownerId,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        quota,
      });
      track("code_issued", { count: codes.length });
      return { codes };
    } catch (e) {
      if (e instanceof QuotaExceededError) {
        throw new ForbiddenException(`quota_exceeded:${e.used}/${e.quota}`);
      }
      throw e;
    }
  }

  // 注意：batch/disable 必须在 :id/disable 之前声明，否则会被 :id="batch" 误匹配。
  @Post("codes/batch/disable")
  async batchDisable(@Req() req: RequestWithAccount, @Body() body: unknown) {
    const { ids } = batchDisableSchema.parse(body);
    const where: { id: { in: string[] }; ownerId?: string } = { id: { in: ids } };
    if (req.account!.role !== "ADMIN") where.ownerId = req.account!.id;
    const r = await this.prisma.activationCode.updateMany({ where, data: { status: "DISABLED" } });
    return { ok: true, count: r.count };
  }

  @Patch("codes/:id")
  async patch(@Req() req: RequestWithAccount, @Param("id") id: string, @Body() body: unknown) {
    await this.assertOwn(req, id);
    const dto = codePatchSchema.parse(body);
    const data: { maxDevices?: number; expiresAt?: Date | null; note?: string | null } = {};
    if (dto.maxDevices !== undefined) data.maxDevices = dto.maxDevices;
    if (dto.expiresAt !== undefined) data.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (dto.note !== undefined) data.note = dto.note;
    await this.prisma.activationCode.update({ where: { id }, data });
    return { ok: true };
  }

  @Post("codes/:id/disable")
  async disable(@Req() req: RequestWithAccount, @Param("id") id: string) {
    await this.assertOwn(req, id);
    await this.codes.disableCode(id);
    return { ok: true };
  }

  @Post("devices/revoke")
  async revoke(@Req() req: RequestWithAccount, @Body() body: unknown) {
    const { codeId, deviceId } = revokeSchema.parse(body);
    await this.assertOwn(req, codeId);
    await this.codes.revokeDevice(codeId, deviceId);
    return { ok: true };
  }

  /** USER 只能操作自己名下的码。 */
  private async assertOwn(req: RequestWithAccount, codeId: string): Promise<void> {
    if (req.account!.role === "ADMIN") return;
    const c = await this.prisma.activationCode.findUnique({
      where: { id: codeId },
      select: { ownerId: true },
    });
    if (!c || c.ownerId !== req.account!.id) throw new ForbiddenException("not your code");
  }
}
