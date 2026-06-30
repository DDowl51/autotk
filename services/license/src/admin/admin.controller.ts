import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { AuthService } from "../domain/auth.service";
import { PrismaService } from "../prisma/prisma.service";
import { hashPassword, verifyPassword } from "../adapters/password";
import { AdminJwtGuard, type RequestWithAccount } from "./admin-jwt.guard";
import { changePasswordSchema, loginSchema } from "./dto";
import { track } from "../telemetry";

@Controller("admin")
export class AdminController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Post("login")
  async login(@Body() body: unknown) {
    const { username, password } = loginSchema.parse(body);
    const r = await this.auth.login(username, password);
    track("admin_login", { ok: r.ok });
    if (!r.ok) throw new UnauthorizedException("bad credentials");
    return { token: r.token, expiresAt: r.expiresAt, role: r.role };
  }

  @Get("me")
  @UseGuards(AdminJwtGuard)
  async me(@Req() req: RequestWithAccount) {
    const id = req.account!.id;
    const a = await this.prisma.account.findUnique({ where: { id } });
    if (!a) throw new UnauthorizedException();
    const used = await this.prisma.activationCode.count({ where: { ownerId: id } });
    return { id: a.id, username: a.username, role: a.role, codeQuota: a.codeQuota, used };
  }

  @Post("me/password")
  @UseGuards(AdminJwtGuard)
  async changePassword(@Req() req: RequestWithAccount, @Body() body: unknown) {
    const { oldPassword, newPassword } = changePasswordSchema.parse(body);
    const a = await this.prisma.account.findUnique({ where: { id: req.account!.id } });
    if (!a || !(await verifyPassword(oldPassword, a.passwordHash))) {
      throw new BadRequestException("wrong password");
    }
    await this.prisma.account.update({
      where: { id: a.id },
      data: { passwordHash: await hashPassword(newPassword) },
    });
    return { ok: true };
  }
}
