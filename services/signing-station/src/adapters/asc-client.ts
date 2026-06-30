import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { api, type AscClientFns, type AscResource } from "node-app-store-connect-api";
import type { AppConfig, AscPort, ProfileRef } from "../core/ports";

/**
 * App Store Connect 适配器：注册设备 + 重生成 ad-hoc/development 描述文件。
 * 鉴权（ES256 JWT）由 node-app-store-connect-api 内部处理。
 * 真实 API（v2.1.2）：fetchJson(url) 直接返回数组/对象（自动翻页）；create({type,attributes,relationships})
 * 返回创建出的资源；remove({type,id}) 删除。
 *
 * 纯部分（请求参数拼装、资源过滤、profile 版本哈希）抽成导出函数单测；真正打 Apple 的多步流程在类里，
 * 需真实凭据，到真机/联调阶段验。
 */

export type ProfileType = "IOS_APP_DEVELOPMENT" | "IOS_APP_ADHOC";

/** 单账号的 ASC 凭据 + 该账号下各 App 的 bundle 标识。 */
export interface AscAccountConfig {
  issuerId: string;
  keyId: string; // = apiKey
  privateKey: string; // .p8 内容（PEM）
  /** 描述文件类型，默认 development（WDA 已验证可用且支持已注册设备 OTA 安装）。 */
  profileType?: ProfileType;
  /** App key → 该 App 的 bundle identifier（用于在 ASC 里定位 bundleId 资源）。 */
  bundleIds: Record<string, string>;
}

export type AscAccountResolver = (accountName: string) => AscAccountConfig;

// ---------- 纯函数（可单测）----------

/** create() 的 devices 参数。 */
export function buildRegisterDeviceArgs(name: string, udid: string) {
  return { type: "devices", attributes: { name, platform: "IOS", udid } };
}

/** create() 的 profiles 参数（relationships 用 {data:...} 形式，库会原样透传）。 */
export function buildCreateProfileArgs(o: {
  name: string;
  profileType: ProfileType;
  bundleIdResourceId: string;
  certificateIds: string[];
  deviceIds: string[];
}) {
  return {
    type: "profiles",
    attributes: { name: o.name, profileType: o.profileType },
    relationships: {
      bundleId: { data: { type: "bundleIds", id: o.bundleIdResourceId } },
      certificates: { data: o.certificateIds.map((id) => ({ type: "certificates", id })) },
      devices: { data: o.deviceIds.map((id) => ({ type: "devices", id })) },
    },
  };
}

/** 设备集指纹：设备集变了它就变，便于排错/缓存对账（与 orchestrator 的缓存失效配合）。 */
export function profileVersion(deviceIds: string[]): string {
  return createHash("sha1").update([...deviceIds].sort().join(",")).digest("hex").slice(0, 12);
}

/** 在 bundleIds 列表里按 identifier 找资源。 */
export function findBundleIdResource(resources: AscResource[], identifier: string): AscResource | undefined {
  return resources.find((r) => r.attributes?.["identifier"] === identifier);
}

/** 选开发证书（DEVELOPMENT）。没有则退回全部。 */
export function pickDevelopmentCertificates(resources: AscResource[]): AscResource[] {
  const dev = resources.filter((r) => String(r.attributes?.["certificateType"] ?? "").includes("DEVELOPMENT"));
  return dev.length > 0 ? dev : resources;
}

/** 描述文件名（按账号+App 唯一，便于查重/重建）。 */
export function profileName(accountName: string, appKey: string): string {
  return `ss-${accountName}-${appKey}`;
}

// ---------- IO（真机/联调阶段验）----------

export interface AscClientOpts {
  /** 写出 .mobileprovision 的目录。 */
  workDir: string;
}

export class AscClient implements AscPort {
  private readonly clients = new Map<string, Promise<AscClientFns>>();

  constructor(
    private readonly resolve: AscAccountResolver,
    private readonly opts: AscClientOpts,
  ) {}

  private client(accountName: string): Promise<AscClientFns> {
    let c = this.clients.get(accountName);
    if (!c) {
      const cfg = this.resolve(accountName);
      c = api({ issuerId: cfg.issuerId, apiKey: cfg.keyId, privateKey: cfg.privateKey });
      this.clients.set(accountName, c);
    }
    return c;
  }

  async registerDevice(accountName: string, udid: string, deviceName = "device"): Promise<void> {
    const c = await this.client(accountName);
    try {
      await c.create(buildRegisterDeviceArgs(deviceName, udid));
    } catch (e) {
      // 已注册（409/重复）视为成功，幂等。其余错误抛出。
      const msg = e instanceof Error ? e.message : String(e);
      if (!/already exists|409|duplicate|ENTITY_ERROR.*udid/i.test(msg)) throw e;
    }
  }

  async regenerateProfile(accountName: string, app: AppConfig): Promise<ProfileRef> {
    const cfg = this.resolve(accountName);
    const profileType = cfg.profileType ?? "IOS_APP_DEVELOPMENT";
    const identifier = cfg.bundleIds[app.key];
    if (!identifier) throw new Error(`账号 ${accountName} 未配置 App ${app.key} 的 bundle identifier`);

    const c = await this.client(accountName);

    // 该账号当前全部设备 → 描述文件应包含它们。
    const devices = (await c.fetchJson("devices?limit=200")) as AscResource[];
    const deviceIds = devices.map((d) => d.id);

    const bundleIds = (await c.fetchJson("bundleIds?limit=200")) as AscResource[];
    const bundleRes = findBundleIdResource(bundleIds, identifier);
    if (!bundleRes) throw new Error(`ASC 里找不到 bundleId：${identifier}`);

    const certs = pickDevelopmentCertificates((await c.fetchJson("certificates?limit=200")) as AscResource[]);
    if (certs.length === 0) throw new Error("ASC 里没有可用证书");
    const certificateIds = certs.map((r) => r.id);

    // 同名旧 profile 先删（profile 不能改，只能重建）。
    const name = profileName(accountName, app.key);
    const profiles = (await c.fetchJson("profiles?limit=200")) as AscResource[];
    const existing = profiles.find((p) => p.attributes?.["name"] === name);
    if (existing) await c.remove({ type: "profiles", id: existing.id });

    const created = await c.create(
      buildCreateProfileArgs({ name, profileType, bundleIdResourceId: bundleRes.id, certificateIds, deviceIds }),
    );
    const content = created.attributes?.["profileContent"];
    if (typeof content !== "string") throw new Error("ASC 创建 profile 未返回 profileContent");

    const path = join(this.opts.workDir, `${name}.mobileprovision`);
    await writeFile(path, Buffer.from(content, "base64"));
    return { path, version: profileVersion(deviceIds) };
  }
}
