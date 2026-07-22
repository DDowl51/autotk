import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { hashPassword } from "../adapters/password";
import {
  AdminJwtGuard,
  requireAdminOrOperator,
  type RequestWithAccount,
} from "./admin-jwt.guard";
import { accountCreateSchema, accountUpdateSchema, resetPasswordSchema } from "./dto";
import { decideQuotaAllocation, isProductAllowed } from "../core";

@Controller("admin/accounts")
@UseGuards(AdminJwtGuard)
export class AccountsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Req() req: RequestWithAccount) {
    requireAdminOrOperator(req);
    const operator = req.account!.role === "OPERATOR";
    const accs = await this.prisma.account.findMany({
      // 运营只看自己创建的分销；ADMIN 看全部。
      where: operator ? { createdById: req.account!.id } : undefined,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        username: true,
        role: true,
        codeQuota: true,
        disabled: true,
        createdAt: true,
        _count: { select: { codes: true } },
        allowedProducts: { select: { productId: true } },
      },
    });
    return accs.map((a) => ({
      id: a.id,
      username: a.username,
      role: a.role,
      codeQuota: a.codeQuota,
      disabled: a.disabled,
      createdAt: a.createdAt,
      codeCount: a._count.codes,
      productIds: a.allowedProducts.map((p) => p.productId),
    }));
  }

  @Post()
  async create(@Req() req: RequestWithAccount, @Body() body: unknown) {
    requireAdminOrOperator(req);
    const dto = accountCreateSchema.parse(body);
    const operator = req.account!.role === "OPERATOR";

    // 运营只能建分销(USER)，不能造 ADMIN/运营。
    if (operator && dto.role && dto.role !== "USER") {
      throw new ForbiddenException("operator_can_only_create_dealer");
    }
    const role = operator ? "USER" : (dto.role ?? "USER");

    const exists = await this.prisma.account.findUnique({ where: { username: dto.username } });
    if (exists) throw new BadRequestException("username taken");

    if (operator) {
      await this.assertProductsWithinOperator(req.account!.id, dto.productIds ?? []);
      await this.assertQuotaWithinPool(req.account!.id, dto.codeQuota ?? null, null);
    }

    const a = await this.prisma.account.create({
      data: {
        username: dto.username,
        passwordHash: await hashPassword(dto.password),
        role,
        codeQuota: dto.codeQuota ?? null,
        createdById: req.account!.id, // 记录归属，运营据此只看/管自己名下
        allowedProducts: dto.productIds?.length
          ? { create: dto.productIds.map((productId) => ({ productId })) }
          : undefined,
      },
    });
    return { id: a.id, username: a.username, role: a.role, codeQuota: a.codeQuota };
  }

  @Post(":id/password")
  async resetPassword(
    @Req() req: RequestWithAccount,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    requireAdminOrOperator(req);
    if (req.account!.role === "OPERATOR") await this.assertOwnAccount(req.account!.id, id);
    const { newPassword } = resetPasswordSchema.parse(body);
    await this.prisma.account.update({
      where: { id },
      data: { passwordHash: await hashPassword(newPassword) },
    });
    return { ok: true };
  }

  @Post(":id")
  async update(@Req() req: RequestWithAccount, @Param("id") id: string, @Body() body: unknown) {
    requireAdminOrOperator(req);
    const operator = req.account!.role === "OPERATOR";
    if (operator) await this.assertOwnAccount(req.account!.id, id);

    const dto = accountUpdateSchema.parse(body);

    if (operator) {
      if (dto.productIds !== undefined) {
        await this.assertProductsWithinOperator(req.account!.id, dto.productIds);
      }
      if (dto.codeQuota !== undefined) {
        // 改额度要重算额度池（排除该分销当前额度，再看新额度是否放得下）。
        await this.assertQuotaWithinPool(req.account!.id, dto.codeQuota, id);
      }
    }

    const data: { codeQuota?: number | null; disabled?: boolean } = {};
    if (dto.codeQuota !== undefined) data.codeQuota = dto.codeQuota;
    if (dto.disabled !== undefined) data.disabled = dto.disabled;
    if (Object.keys(data).length > 0) {
      await this.prisma.account.update({ where: { id }, data });
    }
    // 白名单覆盖式设置：传了 productIds 就整体替换（含清空）。
    if (dto.productIds !== undefined) {
      await this.prisma.$transaction([
        this.prisma.accountProduct.deleteMany({ where: { accountId: id } }),
        this.prisma.accountProduct.createMany({
          data: dto.productIds.map((productId) => ({ accountId: id, productId })),
          skipDuplicates: true,
        }),
      ]);
    }
    return { ok: true };
  }

  // ---- 运营专用校验（ADMIN 不受这些约束） ----

  /** 目标账号必须是该运营创建的，否则拒绝（防越权改他人/ADMIN 账号）。 */
  private async assertOwnAccount(operatorId: string, targetId: string): Promise<void> {
    const t = await this.prisma.account.findUnique({
      where: { id: targetId },
      select: { createdById: true },
    });
    if (!t || t.createdById !== operatorId) throw new ForbiddenException("not_your_account");
  }

  /** 分销可见产品必须是运营自己可见产品的子集。 */
  private async assertProductsWithinOperator(
    operatorId: string,
    productIds: readonly string[],
  ): Promise<void> {
    if (productIds.length === 0) return;
    const me = await this.prisma.account.findUnique({
      where: { id: operatorId },
      select: { allowedProducts: { select: { productId: true } } },
    });
    const own = (me?.allowedProducts ?? []).map((p) => p.productId);
    for (const pid of productIds) {
      if (!isProductAllowed("OPERATOR", own, pid)) {
        throw new ForbiddenException("product_not_allowed");
      }
    }
  }

  /**
   * 分销额度必须放得进运营的额度池：
   *   运营已发码 + 名下【其他】分销已分配额度 + 本次额度 ≤ 运营总预算。
   * @param exceptChildId 改额度时排除该分销当前额度（新建传 null）。
   */
  private async assertQuotaWithinPool(
    operatorId: string,
    childQuota: number | null,
    exceptChildId: string | null,
  ): Promise<void> {
    const me = await this.prisma.account.findUnique({
      where: { id: operatorId },
      select: { codeQuota: true },
    });
    if (me?.codeQuota == null) return; // 运营不限额：随意分配
    const ownIssued = await this.prisma.activationCode.count({ where: { ownerId: operatorId } });
    const agg = await this.prisma.account.aggregate({
      _sum: { codeQuota: true },
      where: {
        createdById: operatorId,
        ...(exceptChildId ? { id: { not: exceptChildId } } : {}),
      },
    });
    const allocatedToOthers = agg._sum.codeQuota ?? 0;
    const d = decideQuotaAllocation(me.codeQuota, ownIssued, allocatedToOthers, childQuota);
    if (!d.ok) {
      if (d.error === "quota_required") throw new BadRequestException("quota_required");
      throw new ForbiddenException(`quota_pool_exceeded:${d.remaining}`);
    }
  }
}
