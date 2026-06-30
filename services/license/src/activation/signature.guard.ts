import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { PrismaService } from "../prisma/prisma.service";
import { verifySignedRequest } from "../domain/request-auth";

/** 校验客户端请求签名（x-product-key/x-timestamp/x-nonce/x-signature + 产品 secret）。 */
@Injectable()
export class SignatureGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { rawBody?: Buffer }>();
    const productKey = req.headers["x-product-key"];
    if (typeof productKey !== "string") throw new UnauthorizedException("missing product key");

    const product = await this.prisma.product.findUnique({ where: { key: productKey } });
    if (!product) throw new UnauthorizedException("unknown product");

    const body = req.rawBody ? req.rawBody.toString("utf8") : "";
    const ok = verifySignedRequest(
      product.secret,
      req.headers as Record<string, string | undefined>,
      body,
    );
    if (!ok) throw new UnauthorizedException("bad signature");
    return true;
  }
}
