import { readFileSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { loadConfig, type RawConfig } from "./config";
import { OtaStore } from "./adapters/ota-store";
import { FileDevicePersistence } from "./adapters/device-persistence";
import { AscClient } from "./adapters/asc-client";
import { ZsignResign } from "./adapters/resign";
import { OpensslMobileconfigSigner } from "./adapters/mobileconfig-sign";
import { DevicePlistExtractor } from "./adapters/device-plist";
import { createTracker } from "./adapters/telemetry";
import { SigningOrchestrator } from "./core/signing-orchestrator";
import { buildOtaApp } from "./web/ota-http";

const CONFIG_PATH = process.env.CONFIG_PATH ?? "./config.json";

async function main(): Promise<void> {
  const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as RawConfig;
  const cfg = loadConfig(raw, process.env, (p) => readFileSync(p, "utf8"));
  mkdirSync(cfg.workDir, { recursive: true });

  // 账号设备集落盘：重启后恢复已注册设备，额度账不丢。
  const persistence = new FileDevicePersistence(join(cfg.workDir, "ota-devices.json"));
  const persisted = await persistence.load();
  const accounts = cfg.poolAccounts.map((a) => ({
    ...a,
    devices: persisted[a.name] ?? a.devices,
  }));
  const store = new OtaStore(accounts, Date.now, (snap) => persistence.save(snap));
  const asc = new AscClient(cfg.ascResolver, { workDir: cfg.workDir });
  const resign = new ZsignResign(cfg.p12Resolver, { workDir: cfg.workDir });
  const orchestrator = new SigningOrchestrator(
    { baseUrl: cfg.baseUrl, apps: cfg.apps },
    { asc, resign, state: store },
  );

  const track = createTracker({
    collectorUrl: cfg.collectorUrl,
    anonId: process.env.STATION_ID ?? randomUUID(),
  });
  const mcSigner = cfg.mobileconfigSigner
    ? new OpensslMobileconfigSigner(cfg.mobileconfigSigner, { workDir: cfg.workDir })
    : undefined;
  const deviceExtractor = new DevicePlistExtractor({ workDir: cfg.workDir });

  const app = buildOtaApp({
    orchestrator,
    store,
    config: cfg.otaHttpConfig,
    extractDevicePlist: (body) => deviceExtractor.extract(body),
    signMobileconfig: mcSigner ? (xml) => mcSigner.sign(xml) : undefined,
    track,
  });

  app
    .listen({ port: cfg.port, host: "0.0.0.0" })
    .then(() => {
      // eslint-disable-next-line no-console
      console.log(
        `signing-station on :${cfg.port}  baseUrl=${cfg.baseUrl}  apps=${Object.keys(cfg.apps).join(",")}  accounts=${cfg.poolAccounts.length}`,
      );
      if (!mcSigner) console.warn("⚠ 未配置 mobileconfigSigner：采集描述文件未签名，真机会提示「未验证」。");
    })
    .catch((e) => {
      // eslint-disable-next-line no-console
      console.error("启动失败：", e);
      process.exit(1);
    });
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("启动失败：", e);
  process.exit(1);
});
