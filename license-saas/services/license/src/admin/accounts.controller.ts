import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { hashPassword } from "../adapters/password";
import { AdminJwtGuard, requireAdmin, type RequestWithAccount } from "./admin-jwt.guard";
import { accountCreateSchema, accountUpdateSchema, resetPasswordSchema } from "./dto";

@Controller("admin/accounts")
@UseGuards(AdminJwtGuard)
export class AccountsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Req() req: RequestWithAccount) {
    requireAdmin(req);
    const accs = await this.prisma.account.findMany({
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
    requireAdmin(req);
    const dto = accountCreateSchema.parse(body);
    const exists = await this.prisma.account.findUnique({ where: { username: dto.username } });
    if (exists) throw new BadRequestException("username taken");
    const a = await this.prisma.account.create({
      data: {
        username: dto.username,
        passwordHash: await hashPassword(dto.password),
        role: dto.role ?? "USER",
        codeQuota: dto.codeQuota ?? null,
        allowedProducts: dto.productIds?.length
          ? { create: dto.productIds.map((productId) => ({ productId })) }
          : undefined,
      },
    });
    return { id: a.id, username: a.username, role: a.role, codeQuota: a.codeQuota };
  }

  @Post(":id/password")
  async resetPassword(@Req() req: RequestWithAccount, @Param("id") id: string, @Body() body: unknown) {
    requireAdmin(req);
    const { newPassword } = resetPasswordSchema.parse(body);
    await this.prisma.account.update({
      where: { id },
      data: { passwordHash: await hashPassword(newPassword) },
    });
    return { ok: true };
  }

  @Post(":id")
  async update(@Req() req: RequestWithAccount, @Param("id") id: string, @Body() body: unknown) {
    requireAdmin(req);
    const dto = accountUpdateSchema.parse(body);
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
}
