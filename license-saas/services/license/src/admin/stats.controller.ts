import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { bucketByDay, statusBreakdown } from "../core";
import { AdminJwtGuard, type RequestWithAccount } from "./admin-jwt.guard";

/** 用量看板统计。ADMIN 看全局，USER 只看自己名下的码。 */
@Controller("admin")
@UseGuards(AdminJwtGuard)
export class StatsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("stats")
  async stats(@Req() req: RequestWithAccount, @Query("days") daysQ?: string) {
    const days = Math.min(180, Math.max(1, Number(daysQ) || 30));
    const admin = req.account!.role === "ADMIN";
    const where = admin ? {} : { ownerId: req.account!.id };

    const codes = await this.prisma.activationCode.findMany({
      where,
      select: { id: true, status: true, createdAt: true },
    });
    const codeIds = codes.map((c) => c.id);

    const activations = codeIds.length
      ? await this.prisma.deviceActivation.findMany({
          where: { codeId: { in: codeIds }, revoked: false },
          select: { firstActivatedAt: true },
        })
      : [];

    const statusCounts = statusBreakdown(codes.map((c) => c.status));
    const active = statusCounts.find((s) => s.status === "ACTIVE")?.count ?? 0;

    return {
      totals: { codes: codes.length, active, devices: activations.length },
      statusCounts,
      issuedByDay: bucketByDay(
        codes.map((c) => c.createdAt.getTime()),
        days,
      ),
      activatedByDay: bucketByDay(
        activations.map((a) => a.firstActivatedAt.getTime()),
        days,
      ),
    };
  }
}
