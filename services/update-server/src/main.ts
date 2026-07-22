import { loadConfig } from "./config";
import { buildServer } from "./server";

async function main(): Promise<void> {
  const cfg = loadConfig();
  const app = buildServer(cfg);
  await app.listen({ port: cfg.port, host: "0.0.0.0" });
  app.log.info(
    `update-server on :${cfg.port}  updatesDir=${cfg.updatesDir}  签名=${cfg.privateKeyPem ? "开" : "关"}`,
  );
}

void main();
