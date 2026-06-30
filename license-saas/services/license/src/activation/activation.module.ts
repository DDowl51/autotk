import { Module } from "@nestjs/common";
import { ActivationController } from "./activation.controller";
import { SignatureGuard } from "./signature.guard";
import { ActivationService } from "../domain/activation.service";
import { PrismaLicenseRepo } from "../adapters/prisma-license.repo";
import { JoseTokenSigner } from "../adapters/jose-signer";
import { PrismaService } from "../prisma/prisma.service";

@Module({
  controllers: [ActivationController],
  providers: [
    SignatureGuard,
    {
      // 用工厂把"端口实现"注进纯领域服务（领域服务本身不带 Nest 装饰器）。
      provide: ActivationService,
      useFactory: (prisma: PrismaService) =>
        new ActivationService(
          new PrismaLicenseRepo(prisma),
          new JoseTokenSigner(
            process.env.JWT_SECRET ?? "dev",
            Number(process.env.TOKEN_TTL_SECONDS ?? 3600),
          ),
        ),
      inject: [PrismaService],
    },
  ],
})
export class ActivationModule {}
