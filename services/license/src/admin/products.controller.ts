import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { generateProductKey, generateSecret } from "../core";
import { AdminJwtGuard, requireAdmin, type RequestWithAccount } from "./admin-jwt.guard";
import { productSchema } from "./dto";

@Controller("admin/products")
@UseGuards(AdminJwtGuard)
export class ProductsController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 列产品（key 公开，不含 secret）。
   * ADMIN 见全部；USER（分销）只见白名单内产品——空白名单则一个都看不到。
   */
  @Get()
  async list(@Req() req: RequestWithAccount) {
    const where =
      req.account!.role === "ADMIN"
        ? {}
        : { allowedBy: { some: { accountId: req.account!.id } } };
    return this.prisma.product.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: { id: true, key: true, name: true, createdAt: true },
    });
  }

  @Post()
  async create(@Req() req: RequestWithAccount, @Body() body: unknown) {
    requireAdmin(req);
    const { name } = productSchema.parse(body);
    const key = generateProductKey();
    const secret = generateSecret();
    const p = await this.prisma.product.create({ data: { key, secret, name } });
    return { id: p.id, key, secret }; // secret 仅此一次明文返回
  }

  @Post(":id/regenerate-secret")
  async regenerate(@Req() req: RequestWithAccount, @Param("id") id: string) {
    requireAdmin(req);
    const secret = generateSecret();
    await this.prisma.product.update({ where: { id }, data: { secret } });
    return { secret }; // 旧 secret 立即失效
  }
}
