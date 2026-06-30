import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { initTelemetry } from "./telemetry";

async function bootstrap(): Promise<void> {
  initTelemetry();
  // rawBody:true 让签名守卫拿到原始请求体做 HMAC 校验。
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`license API on :${port}`);
}

void bootstrap();
