import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { initTelemetry } from "./telemetry";

// 拒绝用公开默认密钥启动：JWT_SECRET 未设或为代码/compose 里的公开占位值时，任何人都能用该公开
// 密钥自签 {role:ADMIN} token 接管整个授权中枢（建/删产品、发码、重置 secret）。上线前必须设强随机值。
// 只拦「代码/compose 内置的公开默认」，不拦开发/e2e 自设的值（如 smoke-secret / dev-jwt-secret-change-me）。
function assertJwtSecret(): void {
  const s = process.env.JWT_SECRET;
  const publicDefaults = new Set(["dev", "change-me-in-prod", "change-me"]);
  if (!s || publicDefaults.has(s)) {
    throw new Error(
      "拒绝启动：JWT_SECRET 未设置或仍为公开默认值。请设置强随机值后重启：openssl rand -hex 32",
    );
  }
}

async function bootstrap(): Promise<void> {
  assertJwtSecret();
  initTelemetry();
  // rawBody:true 让签名守卫拿到原始请求体做 HMAC 校验。
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`license API on :${port}`);
}

void bootstrap();
