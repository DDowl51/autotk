import { describe, it, expect, beforeEach } from "vitest";
import plist from "plist";
import { SigningOrchestrator, type OrchestratorConfig } from "../src/core/signing-orchestrator";
import type {
  AppConfig,
  AscPort,
  ResignPort,
  StatePort,
  SignedIpaRecord,
  ProfileRef,
} from "../src/core/ports";
import { normalizeUdid, type PoolAccount } from "../src/core/account-pool";

// ---- 假端口 ----

class FakeAsc implements AscPort {
  registerCalls: Array<{ account: string; udid: string }> = [];
  regenCalls: Array<{ account: string; app: string }> = [];
  // 每账号设备数 → 让 profile.version 反映"设备集变化"
  constructor(private readonly deviceCount: (account: string) => number) {}
  async registerDevice(accountName: string, udid: string): Promise<void> {
    this.registerCalls.push({ account: accountName, udid: normalizeUdid(udid) });
  }
  async regenerateProfile(accountName: string, app: AppConfig): Promise<ProfileRef> {
    this.regenCalls.push({ account: accountName, app: app.key });
    return { path: `/p/${accountName}.mobileprovision`, version: `${accountName}@${this.deviceCount(accountName)}` };
  }
}

class FakeResign implements ResignPort {
  signCalls: Array<{ account: string; app: string; profileVersion: string }> = [];
  async sign(input: { accountName: string; app: AppConfig; profile: ProfileRef }): Promise<Buffer> {
    this.signCalls.push({ account: input.accountName, app: input.app.key, profileVersion: input.profile.version });
    return Buffer.from(`signed:${input.app.key}:${input.accountName}:${input.profile.version}`);
  }
}

class FakeState implements StatePort {
  accounts: PoolAccount[];
  ipas = new Map<string, SignedIpaRecord & { bytes: Buffer }>();
  private tokenSeq = 0;
  constructor(accounts: PoolAccount[]) {
    this.accounts = accounts.map((a) => ({ ...a, devices: [...a.devices] }));
  }
  private key(acct: string, app: string) {
    return `${acct}::${app}`;
  }
  async listAccounts(): Promise<PoolAccount[]> {
    return this.accounts.map((a) => ({ ...a, devices: [...a.devices] }));
  }
  async saveAccount(account: PoolAccount): Promise<void> {
    const i = this.accounts.findIndex((a) => a.name === account.name);
    if (i >= 0) this.accounts[i] = { ...account, devices: [...account.devices] };
    else this.accounts.push(account);
  }
  async getSignedIpa(account: string, app: string): Promise<SignedIpaRecord | undefined> {
    const r = this.ipas.get(this.key(account, app));
    return r ? { token: r.token, profileVersion: r.profileVersion } : undefined;
  }
  async putSignedIpa(account: string, app: string, ipa: Buffer, profileVersion: string): Promise<SignedIpaRecord> {
    const token = `tok${++this.tokenSeq}`;
    const rec = { token, profileVersion, bytes: ipa };
    this.ipas.set(this.key(account, app), rec);
    return { token, profileVersion };
  }
  async invalidateAccountIpas(account: string): Promise<void> {
    for (const k of [...this.ipas.keys()]) if (k.startsWith(`${account}::`)) this.ipas.delete(k);
  }
}

// ---- 固定配置 ----

const APPS: Record<string, AppConfig> = {
  wda: { key: "wda", bundleId: "com.ddowl.WebDriverAgentRunner.xctrunner", title: "WDA", version: "5.15.5", motherIpaPath: "apps/wda.ipa" },
  autotk: { key: "autotk", bundleId: "com.ddowl.autotk", title: "autotk", version: "1.0.0", motherIpaPath: "apps/autotk.ipa" },
};
const CONFIG: OrchestratorConfig = { baseUrl: "https://install.example.com", apps: APPS };

const acct = (name: string, capacity: number, devices: string[] = []): PoolAccount => ({ name, capacity, devices });

function setup(accounts: PoolAccount[]) {
  const state = new FakeState(accounts);
  const asc = new FakeAsc((name) => state.accounts.find((a) => a.name === name)?.devices.length ?? 0);
  const resign = new FakeResign();
  const orch = new SigningOrchestrator(CONFIG, { asc, resign, state });
  return { orch, state, asc, resign };
}

describe("SigningOrchestrator.enroll", () => {
  const UDID = "EB0C563DCA21A2F9C20C14EDA73B42453C75B4E7";

  it("新设备：注册 + 重生 profile + 重签 + 出 manifest", async () => {
    const { orch, state, asc, resign } = setup([acct("a", 100)]);
    const r = await orch.enroll("wda", UDID, "机-01");
    expect(r.state).toBe("ready");
    if (r.state !== "ready") return;
    expect(r.account).toBe("a");
    expect(r.registeredNewDevice).toBe(true);
    expect(r.resigned).toBe(true);
    expect(asc.registerCalls).toEqual([{ account: "a", udid: UDID.toLowerCase() }]);
    expect(resign.signCalls.length).toBe(1);
    // 账号已落盘新设备
    expect((await state.listAccounts())[0].devices).toContain(UDID.toLowerCase());
    // manifest 正确
    expect(r.ipaUrl).toBe(`https://install.example.com/ota/ipa/${r.ipaToken}`);
    const meta = (plist.parse(r.manifestXml) as any).items[0].metadata;
    expect(meta["bundle-identifier"]).toBe(APPS.wda.bundleId);
  });

  it("同设备同 App 第二次：命中缓存，不注册不重签", async () => {
    const { orch, asc, resign } = setup([acct("a", 100)]);
    await orch.enroll("wda", UDID);
    const r2 = await orch.enroll("wda", UDID);
    if (r2.state !== "ready") throw new Error("should be ready");
    expect(r2.registeredNewDevice).toBe(false);
    expect(r2.resigned).toBe(false);
    expect(asc.registerCalls.length).toBe(1); // 仍是第一次那一次
    expect(resign.signCalls.length).toBe(1);
  });

  it("同设备换 App：不重复注册，但该 App 无缓存 → 重签", async () => {
    const { orch, asc, resign } = setup([acct("a", 100)]);
    await orch.enroll("wda", UDID);
    const r = await orch.enroll("autotk", UDID);
    if (r.state !== "ready") throw new Error("should be ready");
    expect(r.registeredNewDevice).toBe(false);
    expect(r.resigned).toBe(true);
    expect(asc.registerCalls.length).toBe(1); // 设备没重复注册
    expect(resign.signCalls.map((c) => c.app)).toEqual(["wda", "autotk"]);
  });

  it("同账号新增第二台设备：作废旧缓存，已缓存的 App 也要按新设备集重签", async () => {
    const { orch, asc, resign, state } = setup([acct("a", 100)]);
    await orch.enroll("wda", UDID); // 设备1，wda 已缓存（profileVersion a@1）
    const UDID2 = "1111111111111111111111111111111111111111";
    const r = await orch.enroll("wda", UDID2); // 设备2 加入 → 作废 → 重签
    if (r.state !== "ready") throw new Error("should be ready");
    expect(r.registeredNewDevice).toBe(true);
    expect(r.resigned).toBe(true);
    expect(asc.registerCalls.length).toBe(2);
    expect(resign.signCalls.length).toBe(2);
    // 第二次重签的 profile 版本反映 2 台设备
    expect(resign.signCalls[1].profileVersion).toBe("a@2");
    expect((await state.listAccounts())[0].devices.length).toBe(2);
  });

  it("池满：返回 pool-full，不碰 Apple/zsign", async () => {
    const { orch, asc, resign } = setup([acct("a", 1, ["existing"])]);
    const r = await orch.enroll("wda", "brand-new-udid");
    expect(r.state).toBe("pool-full");
    expect(asc.registerCalls.length).toBe(0);
    expect(resign.signCalls.length).toBe(0);
  });

  it("已满账号但设备已注册 → 仍可命中并出包", async () => {
    const { orch } = setup([acct("a", 1, [UDID.toLowerCase()])]);
    const r = await orch.enroll("wda", UDID);
    expect(r.state).toBe("ready");
  });

  it("多账号：新设备分到剩余名额最多的账号", async () => {
    const { orch } = setup([acct("a", 100, new Array(90).fill("x")), acct("b", 100, new Array(10).fill("y"))]);
    const r = await orch.enroll("wda", UDID);
    if (r.state !== "ready") throw new Error("should be ready");
    expect(r.account).toBe("b");
  });

  it("未知 App 抛错", async () => {
    const { orch } = setup([acct("a", 100)]);
    await expect(orch.enroll("nope", UDID)).rejects.toThrow(/未知 App/);
  });

  it("baseUrl 非 https：构造即抛错", () => {
    expect(() => new SigningOrchestrator({ baseUrl: "http://x", apps: APPS }, {} as any)).toThrow(/https/);
  });
});
