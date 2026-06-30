import { describe, it, expect } from "vitest";
import plist from "plist";
import { buildOtaApp } from "../src/web/ota-http";
import { OtaStore } from "../src/adapters/ota-store";
import { SigningOrchestrator } from "../src/core/signing-orchestrator";
import type { AppConfig, AscPort, ResignPort, ProfileRef } from "../src/core/ports";
import type { PoolAccount } from "../src/core/account-pool";

const APPS: Record<string, AppConfig> = {
  wda: { key: "wda", bundleId: "com.ddowl.WebDriverAgentRunner.xctrunner", title: "WDA", version: "5.15.5", motherIpaPath: "apps/wda.ipa" },
};

class FakeAsc implements AscPort {
  registered: string[] = [];
  async registerDevice(_a: string, udid: string): Promise<void> {
    this.registered.push(udid);
  }
  async regenerateProfile(account: string): Promise<ProfileRef> {
    return { path: `/p/${account}`, version: `${account}@${this.registered.length}` };
  }
}
class FakeResign implements ResignPort {
  async sign(): Promise<Buffer> {
    return Buffer.from("IPA-BYTES");
  }
}

function build(accounts: PoolAccount[]) {
  const store = new OtaStore(accounts);
  const orchestrator = new SigningOrchestrator(
    { baseUrl: "https://install.example.com", apps: APPS },
    { asc: new FakeAsc(), resign: new FakeResign(), state: store },
  );
  const app = buildOtaApp({
    orchestrator,
    store,
    config: {
      baseUrl: "https://install.example.com",
      organization: "ddowl",
      enrollIdentifier: "com.ddowl.signing-station.enroll",
      apps: { wda: { title: "WebDriverAgent" } },
    },
    uuid: () => "11111111-2222-3333-4444-555555555555",
  });
  return { app, store };
}

const devicePlist = (udid: string) =>
  plist.build({ UDID: udid, PRODUCT: "iPhone10,4", DEVICE_NAME: "机-01" } as any);

describe("OTA HTTP 全链路", () => {
  it("扫码 → 登记 → 回调 → ready → manifest → 下 IPA", async () => {
    const { app } = build([{ name: "a", capacity: 100, devices: [] }]);

    // 1) 落地页 + 取 session
    const landing = await app.inject({ method: "GET", url: "/ota/wda" });
    expect(landing.statusCode).toBe(200);
    expect(landing.headers["content-type"]).toMatch(/text\/html/);
    const s = landing.body.match(/data-session="([0-9a-f]+)"/)![1];
    expect(s).toBeTruthy();

    // 2) 采集描述文件，回调地址应含 session + app
    const mc = await app.inject({ method: "GET", url: `/ota/wda/enroll.mobileconfig?s=${s}` });
    expect(mc.statusCode).toBe(200);
    expect(mc.headers["content-type"]).toMatch(/apple-aspen-config/);
    const mcParsed = plist.parse(mc.body) as any;
    expect(mcParsed.PayloadContent.URL).toBe(
      `https://install.example.com/ota/enroll-callback?s=${s}&app=wda`,
    );

    // 3) 设备回传 UDID
    const cb = await app.inject({
      method: "POST",
      url: `/ota/enroll-callback?s=${s}&app=wda`,
      headers: { "content-type": "application/x-apple-aspen-config" },
      payload: devicePlist("EB0C563DCA21A2F9C20C14EDA73B42453C75B4E7"),
    });
    expect(cb.statusCode).toBe(200);

    // 4) 状态 ready
    const st = await app.inject({ method: "GET", url: `/ota/wda/status?s=${s}` });
    expect(st.json()).toMatchObject({ state: "ready" });

    // 5) manifest
    const man = await app.inject({ method: "GET", url: `/ota/wda/manifest.plist?s=${s}` });
    expect(man.statusCode).toBe(200);
    const item = (plist.parse(man.body) as any).items[0];
    expect(item.metadata["bundle-identifier"]).toBe(APPS.wda.bundleId);

    // 6) 顺着 manifest 里的 ipaUrl 下 IPA
    const ipaUrl: string = item.assets[0].url;
    expect(ipaUrl).toMatch(/^https:\/\/install\.example\.com\/ota\/ipa\//);
    const token = ipaUrl.split("/ota/ipa/")[1];
    const ipa = await app.inject({ method: "GET", url: `/ota/ipa/${token}` });
    expect(ipa.statusCode).toBe(200);
    expect(ipa.headers["content-type"]).toMatch(/octet-stream/);
    expect(ipa.rawPayload.toString()).toBe("IPA-BYTES");
  });

  it("池满 → session 状态 pool-full（落地页据此提示）", async () => {
    const { app } = build([{ name: "a", capacity: 1, devices: ["existing"] }]);
    const landing = await app.inject({ method: "GET", url: "/ota/wda" });
    const s = landing.body.match(/data-session="([0-9a-f]+)"/)![1];
    await app.inject({
      method: "POST",
      url: `/ota/enroll-callback?s=${s}&app=wda`,
      headers: { "content-type": "application/x-apple-aspen-config" },
      payload: devicePlist("brand-new-udid-xxxxxxxxxxxxxxxxxxxxxxxx"),
    });
    expect((await app.inject({ method: "GET", url: `/ota/wda/status?s=${s}` })).json()).toMatchObject({
      state: "pool-full",
    });
  });

  it("回传里缺 UDID → session 标 error", async () => {
    const { app } = build([{ name: "a", capacity: 100, devices: [] }]);
    const landing = await app.inject({ method: "GET", url: "/ota/wda" });
    const s = landing.body.match(/data-session="([0-9a-f]+)"/)![1];
    await app.inject({
      method: "POST",
      url: `/ota/enroll-callback?s=${s}&app=wda`,
      headers: { "content-type": "application/x-apple-aspen-config" },
      payload: plist.build({ PRODUCT: "iPhone10,4" } as any),
    });
    const st = (await app.inject({ method: "GET", url: `/ota/wda/status?s=${s}` })).json();
    expect(st.state).toBe("error");
    expect(st.error).toMatch(/UDID/);
  });

  it("未知 App → 404", async () => {
    const { app } = build([{ name: "a", capacity: 100, devices: [] }]);
    expect((await app.inject({ method: "GET", url: "/ota/nope" })).statusCode).toBe(404);
  });

  it("manifest 未就绪 → 404", async () => {
    const { app } = build([{ name: "a", capacity: 100, devices: [] }]);
    const landing = await app.inject({ method: "GET", url: "/ota/wda" });
    const s = landing.body.match(/data-session="([0-9a-f]+)"/)![1];
    expect((await app.inject({ method: "GET", url: `/ota/wda/manifest.plist?s=${s}` })).statusCode).toBe(404);
  });

  it("未知 IPA token → 404", async () => {
    const { app } = build([{ name: "a", capacity: 100, devices: [] }]);
    expect((await app.inject({ method: "GET", url: "/ota/ipa/deadbeef" })).statusCode).toBe(404);
  });

  it("埋点 + 描述文件加签：扫码记 ota_scan，登记记 ota_enroll/ota_sign，描述文件走签名器", async () => {
    const store = new OtaStore([{ name: "a", capacity: 100, devices: [] }]);
    const orchestrator = new SigningOrchestrator(
      { baseUrl: "https://install.example.com", apps: APPS },
      { asc: new FakeAsc(), resign: new FakeResign(), state: store },
    );
    const events: string[] = [];
    const app = buildOtaApp({
      orchestrator,
      store,
      config: {
        baseUrl: "https://install.example.com",
        organization: "ddowl",
        enrollIdentifier: "com.ddowl.signing-station.enroll",
        apps: { wda: { title: "WDA" } },
      },
      uuid: () => "11111111-2222-3333-4444-555555555555",
      track: (name) => events.push(name),
      signMobileconfig: async () => Buffer.from("SIGNED-DER"),
    });

    const landing = await app.inject({ method: "GET", url: "/ota/wda" });
    const s = landing.body.match(/data-session="([0-9a-f]+)"/)![1];

    const mc = await app.inject({ method: "GET", url: `/ota/wda/enroll.mobileconfig?s=${s}` });
    expect(mc.rawPayload.toString()).toBe("SIGNED-DER"); // 走了签名器

    await app.inject({
      method: "POST",
      url: `/ota/enroll-callback?s=${s}&app=wda`,
      headers: { "content-type": "application/x-apple-aspen-config" },
      payload: devicePlist("EB0C563DCA21A2F9C20C14EDA73B42453C75B4E7"),
    });
    expect(events).toContain("ota_scan");
    expect(events).toContain("ota_enroll");
    expect(events).toContain("ota_sign");
  });
});
