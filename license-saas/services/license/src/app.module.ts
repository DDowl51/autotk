import { Module } from "@nestjs/common";
import { PrismaModule } from "./prisma/prisma.module";
import { ActivationModule } from "./activation/activation.module";
import { AdminModule } from "./admin/admin.module";

@Module({
  imports: [PrismaModule, ActivationModule, AdminModule],
})
export class AppModule {}
