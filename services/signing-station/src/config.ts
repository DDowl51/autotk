import type { PoolAccount } from "./core/account-pool";
import type { AppConfig } from "./core/ports";
import type { AscAccountConfig, ProfileType } from "./adapters/asc-client";
import type { AccountP12 } from "./adapters/resign";
import type { SmimeCreds } from "./adapters/mobileconfig-sign";
import type { OtaHttpConfig } from "./web/ota-http";

/**
 * 配置加载与校验（纯逻辑，文件读取由调用方注入 readText，便于单测）。
 * 配置来源：config.json（含凭据路径/口令，gitignore）+ 少量环境变量覆盖。
 */

// ---- config.json 形状 ----
export interface RawApp {
  bundleId: string;
  title: string;
  version: string;
  motherIpaPath: string;
  /** XCTest 运行器（WDA）置 true：母包必须含 XCTest 框架，否则装上点不开。 */
  requiresXctest?: boolean;
}
export interface RawAccount {
  name: string;
  capacity?: number;
  devices?: string[];
  asc: { issuerId: string; keyId: string; p8Path: string; profileType?: ProfileType };
  signing: { p12Path: string; p12Password: string };
  /** App key → bundle identifier（在 ASC 里定位 bundleId 资源）。 */
  bundleIds: Record<string, string>;
}
export interface RawConfig {
  baseUrl: string;
  organization: string;
  enrollIdentifier: string;
  workDir?: string;
  port?: number;
  collectorUrl?: string;
  mobileconfigSigner?: { signerCertPath: string; keyPath: string; certChainPath?: string };
  apps: Record<string, RawApp>;
  accounts: RawAccount[];
}

export interface EnvOverrides {
  BASE_URL?: string;
  COLLECTOR_URL?: string;
  PORT?: string;
  WORK_DIR?: string;
}

// ---- 加载结果 ----
export interface StationConfig {
  baseUrl: string;
  port: number;
  workDir: string;
  collectorUrl?: string;
  organization: string;
  enrollIdentifier: string;
  apps: Record<string, AppConfig>;
  poolAccounts: PoolAccount[];
  ascResolver: (accountName: string) => AscAccountConfig;
  p12Resolver: (accountName: string) => AccountP12;
  otaHttpConfig: OtaHttpConfig;
  mobileconfigSigner?: SmimeCreds;
}

function req(value: string | undefined, what: string): string {
  if (!value || value.trim() === "") throw new Error(`配置缺少 ${what}`);
  return value;
}

/**
 * @param raw       config.json 解析后的对象
 * @param env       环境变量覆盖
 * @param readText  读文本文件（用于加载 .p8 私钥内容）；注入便于单测
 */
export function loadConfig(raw: RawConfig, env: EnvOverrides, readText: (path: string) => string): StationConfig {
  const baseUrl = req(env.BASE_URL ?? raw.baseUrl, "baseUrl");
  if (!/^https:\/\//i.test(baseUrl)) throw new Error(`baseUrl 必须是 https：${baseUrl}`);
  req(raw.organization, "organization");
  req(raw.enrollIdentifier, "enrollIdentifier");

  const appKeys = Object.keys(raw.apps ?? {});
  if (appKeys.length === 0) throw new Error("apps 不能为空");
  const apps: Record<string, AppConfig> = {};
  for (const key of appKeys) {
    const a = raw.apps[key];
    apps[key] = {
      key,
      bundleId: req(a.bundleId, `apps.${key}.bundleId`),
      title: req(a.title, `apps.${key}.title`),
      version: req(a.version, `apps.${key}.version`),
      motherIpaPath: req(a.motherIpaPath, `apps.${key}.motherIpaPath`),
      requiresXctest: a.requiresXctest ?? false,
    };
  }

  if (!Array.isArray(raw.accounts) || raw.accounts.length === 0) throw new Error("accounts 不能为空");
  const seen = new Set<string>();
  const poolAccounts: PoolAccount[] = [];
  const ascMap = new Map<string, AscAccountConfig>();
  const p12Map = new Map<string, AccountP12>();

  for (const acc of raw.accounts) {
    const name = req(acc.name, "account.name");
    if (seen.has(name)) throw new Error(`账号名重复：${name}`);
    seen.add(name);

    const capacity = acc.capacity ?? 100;
    if (!Number.isInteger(capacity) || capacity <= 0) throw new Error(`账号 ${name} capacity 非法`);

    // 每个 App 都要有 bundle identifier。
    for (const key of appKeys) {
      if (!acc.bundleIds?.[key]) throw new Error(`账号 ${name} 缺少 App ${key} 的 bundleIds`);
    }

    const privateKey = readText(req(acc.asc?.p8Path, `账号 ${name} asc.p8Path`));
    ascMap.set(name, {
      issuerId: req(acc.asc?.issuerId, `账号 ${name} asc.issuerId`),
      keyId: req(acc.asc?.keyId, `账号 ${name} asc.keyId`),
      privateKey,
      profileType: acc.asc?.profileType ?? "IOS_APP_DEVELOPMENT",
      bundleIds: acc.bundleIds,
    });
    p12Map.set(name, {
      p12Path: req(acc.signing?.p12Path, `账号 ${name} signing.p12Path`),
      p12Password: req(acc.signing?.p12Password, `账号 ${name} signing.p12Password`),
    });
    poolAccounts.push({ name, capacity, devices: (acc.devices ?? []).map((d) => d.trim().toLowerCase()) });
  }

  const resolve = <T>(map: Map<string, T>, name: string): T => {
    const v = map.get(name);
    if (!v) throw new Error(`未知账号：${name}`);
    return v;
  };

  return {
    baseUrl,
    port: Number(env.PORT ?? raw.port ?? 4100),
    workDir: env.WORK_DIR ?? raw.workDir ?? "./data/work",
    collectorUrl: env.COLLECTOR_URL ?? raw.collectorUrl,
    organization: raw.organization,
    enrollIdentifier: raw.enrollIdentifier,
    apps,
    poolAccounts,
    ascResolver: (name) => resolve(ascMap, name),
    p12Resolver: (name) => resolve(p12Map, name),
    otaHttpConfig: {
      baseUrl,
      organization: raw.organization,
      enrollIdentifier: raw.enrollIdentifier,
      apps: Object.fromEntries(appKeys.map((k) => [k, { title: apps[k].title }])),
    },
    mobileconfigSigner: raw.mobileconfigSigner,
  };
}
