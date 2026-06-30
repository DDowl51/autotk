import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller";
import { ProductsController } from "./products.controller";
import { CodesController } from "./codes.controller";
import { AccountsController } from "./accounts.controller";
import { StatsController } from "./stats.controller";
import { AdminJwtGuard } from "./admin-jwt.guard";
import { AuthService } from "../domain/auth.service";
import { CodeAdminService } from "../domain/code-admin.service";
import { PrismaAccountRepo } from "../adapters/prisma-account.repo";
import { PrismaCodeAdminRepo } from "../adapters/prisma-code-admin.repo";
import { JoseAdminTokenSigner } from "../adapters/jose-admin-signer";
import { passwordVerifier } from "../adapters/password";
import { PrismaService } from "../prisma/prisma.service";

@Module({
  controllers: [AdminController, ProductsController, CodesController, AccountsController, StatsController],
  providers: [
    AdminJwtGuard,
    {
      provide: AuthService,
      useFactory: (prisma: PrismaService) =>
        new AuthService(
          new PrismaAccountRepo(prisma),
          passwordVerifier,
          new JoseAdminTokenSigner(process.env.JWT_SECRET ?? "dev"),
        ),
      inject: [PrismaService],
    },
    {
      provide: CodeAdminService,
      useFactory: (prisma: PrismaService) => new CodeAdminService(new PrismaCodeAdminRepo(prisma)),
      inject: [PrismaService],
    },
  ],
})
export class AdminModule {}
