import type { PoolAccount } from "./account-pool";

/**
 * 端口定义：把「调 Apple、跑 zsign、读写磁盘」这些脏活抽象成接口，
 * 让编排层（signing-orchestrator）是纯逻辑、可用假实现单测。
 * 真实实现放 src/adapters/。
 */

/** 一个 App 的签名配置（WDA / autotk 各一份）。 */
export interface AppConfig {
  /** 入口键，如 "wda" / "autotk"。 */
  key: string;
  /** bundle id，如 com.ddowl.WebDriverAgentRunner.xctrunner。 */
  bundleId: string;
  /** 安装显示标题。 */
  title: string;
  /** 版本号（显示用）。 */
  version: string;
  /** 未签名母包路径（apps/wda.ipa 等）。 */
  motherIpaPath: string;
}

/** 重生成后的 ad-hoc 描述文件引用，喂给重签。 */
export interface ProfileRef {
  /** .mobileprovision 路径（或适配器自定位的句柄）。 */
  path: string;
  /** 版本/指纹：账号设备集变了它就变，便于排错与缓存对账。 */
  version: string;
}

/** App Store Connect 操作（每账号一套凭据，由适配器按 accountName 路由）。 */
export interface AscPort {
  /** 把 UDID 注册到某账号下（已存在应幂等）。 */
  registerDevice(accountName: string, udid: string, deviceName?: string): Promise<void>;
  /** 重生成该账号该 App 的 ad-hoc 描述文件（含该账号当前全部设备）。 */
  regenerateProfile(accountName: string, app: AppConfig): Promise<ProfileRef>;
}

export interface SignInput {
  accountName: string;
  app: AppConfig;
  profile: ProfileRef;
}

/** 重签（zsign）：用账号的 p12 + 描述文件把母包重签，返回签名后的 IPA 字节。 */
export interface ResignPort {
  sign(input: SignInput): Promise<Buffer>;
}

/** 已缓存的签名 IPA 记录。 */
export interface SignedIpaRecord {
  /** 下载 token → /ota/ipa/:token。 */
  token: string;
  /** 签名时所用 profile 的版本（对账/排错用）。 */
  profileVersion: string;
}

/**
 * 状态持久化：账号池 + 签名 IPA 缓存。
 * 缓存按 (account, appKey) 维度——同账号同 App 的所有设备共用一份签名 IPA。
 */
export interface StatePort {
  listAccounts(): Promise<PoolAccount[]>;
  saveAccount(account: PoolAccount): Promise<void>;

  getSignedIpa(accountName: string, appKey: string): Promise<SignedIpaRecord | undefined>;
  putSignedIpa(
    accountName: string,
    appKey: string,
    ipa: Buffer,
    profileVersion: string,
  ): Promise<SignedIpaRecord>;
  /** 该账号设备集变了 → 作废其名下所有 App 的签名缓存（需按新设备集重签）。 */
  invalidateAccountIpas(accountName: string): Promise<void>;
}
