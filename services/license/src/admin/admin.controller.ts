import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
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
import { createThrottleState, lockedSeconds, recordFailure, recordSuccess } from "../core/login-throttle";

@Controller("admin")
export class AdminController {
  // 登录限流状态（控制器为单例，跨请求保留）。按客户端 IP 计数，挡在线爆破。
  private readonly loginThrottle = createThrottleState();

  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Post("login")
  async login(@Body() body: unknown, @Req() req: { ip?: string }) {
    const key = req.ip ?? "unknown";
    const now = Date.now();
    const wait = lockedSeconds(this.loginThrottle, key, now);
    if (wait > 0) {
      throw new HttpException(`登录尝试过于频繁，请 ${wait} 秒后再试`, HttpStatus.TOO_MANY_REQUESTS);
    }
    const { username, password } = loginSchema.parse(body);
    const r = await this.auth.login(username, password);
    track("admin_login", { ok: r.ok });
    if (!r.ok) {
      recordFailure(this.loginThrottle, key, now);
      throw new UnauthorizedException("bad credentials");
    }
    recordSuccess(this.loginThrottle, key);
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
