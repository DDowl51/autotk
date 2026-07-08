import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { verifyAdminToken } from "../adapters/jose-admin-signer";

export interface RequestWithAccount extends Request {
  account?: { id: string; role: string };
}

/** 校验管理端 Bearer JWT，挂到 req.account。 */
@Injectable()
export class AdminJwtGuard implements CanActivate {
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<RequestWithAccount>();
    const auth = req.headers["authorization"];
    if (!auth || !auth.startsWith("Bearer ")) throw new UnauthorizedException("missing token");
    try {
      const claims = await verifyAdminToken(process.env.JWT_SECRET ?? "dev", auth.slice(7));
      req.account = { id: claims.sub, role: claims.role };
      return true;
    } catch {
      throw new UnauthorizedException("invalid token");
    }
  }
}

/** 要求当前账号为超级管理员。 */
export function requireAdmin(req: RequestWithAccount): void {
  if (req.account?.role !== "ADMIN") throw new ForbiddenException("admin only");
}

/** 要求当前账号为超级管理员或运营（可管理账号；建产品仍仅 ADMIN）。 */
export function requireAdminOrOperator(req: RequestWithAccount): void {
  const role = req.account?.role;
  if (role !== "ADMIN" && role !== "OPERATOR") {
    throw new ForbiddenException("admin or operator only");
  }
}
