import { describe, it, expect } from "vitest";
import { loadConfig, type RawConfig } from "../src/config";

const good: RawConfig = {
  baseUrl: "https://install.example.com",
  organization: "ddowl",
  enrollIdentifier: "com.ddowl.signing-station.enroll",
  apps: {
    wda: { bundleId: "com.ddowl.WebDriverAgentRunner.xctrunner", title: "WDA", version: "5.15.5", motherIpaPath: "apps/wda.ipa" },
  },
  accounts: [
    {
      name: "a",
      capacity: 100,
      asc: { issuerId: "iss", keyId: "kid", p8Path: "secrets/a.p8" },
      signing: { p12Path: "secrets/a.p12", p12Password: "pw" },
      bundleIds: { wda: "com.ddowl.WebDriverAgentRunner.xctrunner" },
    },
  ],
};
const fakeRead = (p: string) => `-----KEY ${p}-----`;

describe("loadConfig", () => {
  it("正常加载并派生各部分", () => {
    const cfg = loadConfig(good, {}, fakeRead);
    expect(cfg.baseUrl).toBe("https://install.example.com");
    expect(cfg.port).toBe(4100);
    expect(Object.keys(cfg.apps)).toEqual(["wda"]);
    expect(cfg.poolAccounts[0]).toMatchObject({ name: "a", capacity: 100, devices: [] });
    expect(cfg.ascResolver("a")).toMatchObject({ issuerId: "iss", keyId: "kid", profileType: "IOS_APP_DEVELOPMENT" });
    expect(cfg.ascResolver("a").privateKey).toContain("secrets/a.p8"); // 经 readText 读入
    expect(cfg.p12Resolver("a")).toEqual({ p12Path: "secrets/a.p12", p12Password: "pw" });
    expect(cfg.otaHttpConfig.apps).toEqual({ wda: { title: "WDA" } });
  });

  it("env 覆盖 baseUrl/port/collectorUrl", () => {
    const cfg = loadConfig(good, { BASE_URL: "https://x.cn", PORT: "5000", COLLECTOR_URL: "https://t.cn" }, fakeRead);
    expect(cfg.baseUrl).toBe("https://x.cn");
    expect(cfg.port).toBe(5000);
    expect(cfg.collectorUrl).toBe("https://t.cn");
  });

  it("baseUrl 非 https 抛错", () => {
    expect(() => loadConfig({ ...good, baseUrl: "http://x" }, {}, fakeRead)).toThrow(/https/);
  });

  it("账号缺某 App 的 bundleIds 抛错", () => {
    const bad = { ...good, accounts: [{ ...good.accounts[0], bundleIds: {} }] };
    expect(() => loadConfig(bad, {}, fakeRead)).toThrow(/bundleIds/);
  });

  it("账号名重复抛错", () => {
    const bad = { ...good, accounts: [good.accounts[0], good.accounts[0]] };
    expect(() => loadConfig(bad, {}, fakeRead)).toThrow(/重复/);
  });

  it("apps 为空抛错", () => {
    expect(() => loadConfig({ ...good, apps: {} }, {}, fakeRead)).toThrow(/apps/);
  });

  it("未知账号解析抛错", () => {
    const cfg = loadConfig(good, {}, fakeRead);
    expect(() => cfg.ascResolver("nope")).toThrow(/未知账号/);
  });
});
