import { pickAccountForUdid, withDeviceRegistered, type PoolAccount } from "./account-pool";
import { buildManifest } from "./manifest";
import type { AppConfig, AscPort, ResignPort, StatePort } from "./ports";

/**
 * 核心编排：一台设备 enroll 某 App 时，决定账号 → 注册 UDID → 重生 profile → 重签 → 出 manifest。
 * 纯逻辑（依赖注入端口），所有分支可单测，不碰真实 Apple/zsign/磁盘。
 *
 * 关键不变量：
 * - 同一账号同一 App 的全部设备共用一份签名 IPA（按 account+appKey 缓存）。
 * - 给账号**新增设备**会作废其名下所有缓存（profile 设备集变了，必须按新集合重签）；
 *   已装的老设备无需重装（新 profile 仍含其 UDID）——这是真机性质，这里保证的是"重签覆盖到"。
 * - 已注册过的设备 + 已有缓存 → 直接命中，不调 Apple、不重签。
 */

export interface OrchestratorConfig {
  /** https 源，无结尾斜杠，如 https://install.example.com。 */
  baseUrl: string;
  /** 各 App 配置，按 key 索引。 */
  apps: Record<string, AppConfig>;
}

export interface OrchestratorPorts {
  asc: AscPort;
  resign: ResignPort;
  state: StatePort;
}

export type EnrollOutcome =
  | {
      state: "ready";
      account: string;
      appKey: string;
      bundleId: string;
      ipaToken: string;
      ipaUrl: string;
      manifestXml: string;
      /** 本次是否重新签名（false=命中缓存）。 */
      resigned: boolean;
      /** 本次是否注册了新设备（false=该 UDID 早已在账号里）。 */
      registeredNewDevice: boolean;
    }
  | { state: "pool-full" }
  /** 设备已注册但 Apple 仍在 PROCESSING（新账号常见）——还进不了描述文件，让用户稍后重扫。 */
  | { state: "processing"; account: string };

export class SigningOrchestrator {
  constructor(
    private readonly config: OrchestratorConfig,
    private readonly ports: OrchestratorPorts,
  ) {
    if (!/^https:\/\//i.test(config.baseUrl)) {
      throw new Error(`baseUrl 必须是 https，收到：${config.baseUrl}`);
    }
  }

  /**
   * 设备登记 → 备好可安装的签名 IPA + manifest。
   * @param appKey "wda" | "autotk"（须在 config.apps 内）
   * @param udid   设备 UDID（设备回传解析得到）
   */
  async enroll(appKey: string, udid: string, deviceName?: string): Promise<EnrollOutcome> {
    const app = this.config.apps[appKey];
    if (!app) throw new Error(`未知 App：${appKey}`);

    const { asc, resign, state } = this.ports;
    const accounts = await state.listAccounts();
    const pick = pickAccountForUdid(accounts, udid);
    if (!pick.ok) return { state: "pool-full" };

    const account = pick.account;
    const registeredNewDevice = !pick.alreadyRegistered;

    if (registeredNewDevice) {
      // 注册到 Apple。⚠️ 新账号注册的设备会先进 PROCESSING（Apple 处理中，可能数小时~数天），
      // 期间它【不会】被收进描述文件 → 发包出去装了必然「integrity could not be verified」。
      await asc.registerDevice(account, udid, deviceName);
      if (!(await asc.deviceEnabled(account, udid))) {
        // 返回 processing 让落地页提示「稍后重扫」，且【不落盘】——保持"新设备"，下次重扫会
        // 重新触发注册/作废/重生，等它 ENABLED 那一次就能带上它并出包。
        return { state: "processing", account };
      }
      // 已 ENABLED → 落盘设备集 + 作废该账号所有签名缓存（设备集变了，需按新集合重签）。
      const acct = accounts.find((a) => a.name === account) as PoolAccount;
      await state.saveAccount(withDeviceRegistered(acct, udid));
      await state.invalidateAccountIpas(account);
    }

    // 确保 (account, app) 有可用签名 IPA：命中缓存则复用，否则重生 profile + 重签。
    let record = await state.getSignedIpa(account, appKey);
    let resigned = false;
    if (!record) {
      const profile = await asc.regenerateProfile(account, app);
      const bytes = await resign.sign({ accountName: account, app, profile });
      record = await state.putSignedIpa(account, appKey, bytes, profile.version);
      resigned = true;
    }

    const ipaUrl = `${this.config.baseUrl}/ota/ipa/${record.token}`;
    const manifestXml = buildManifest({
      ipaUrl,
      bundleId: app.bundleId,
      version: app.version,
      title: app.title,
    });

    return {
      state: "ready",
      account,
      appKey,
      bundleId: app.bundleId,
      ipaToken: record.token,
      ipaUrl,
      manifestXml,
      resigned,
      registeredNewDevice,
    };
  }
}
