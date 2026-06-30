import { describe, it, expect } from "vitest";
import plist from "plist";
import { buildEnrollProfile, parseDeviceAttributes } from "../src/core/enroll-profile";

describe("buildEnrollProfile", () => {
  const base = {
    callbackUrl: "https://install.example.com/ota/enroll-callback?s=tok",
    organization: "ddowl",
    identifier: "com.ddowl.signing-station.enroll",
    uuid: "11111111-2222-3333-4444-555555555555",
  };

  it("生成 Profile Service 描述文件，含回调 URL 与采集字段", () => {
    const xml = buildEnrollProfile(base);
    const p = plist.parse(xml) as any;
    expect(p.PayloadType).toBe("Profile Service");
    expect(p.PayloadContent.URL).toBe(base.callbackUrl);
    expect(p.PayloadContent.DeviceAttributes).toContain("UDID");
    expect(p.PayloadUUID).toBe(base.uuid);
    expect(p.PayloadIdentifier).toBe(base.identifier);
  });

  it("callbackUrl 非 https 抛错", () => {
    expect(() => buildEnrollProfile({ ...base, callbackUrl: "http://x/cb" })).toThrow(/https/);
  });

  it("缺 identifier / uuid 抛错", () => {
    expect(() => buildEnrollProfile({ ...base, identifier: "" })).toThrow();
    expect(() => buildEnrollProfile({ ...base, uuid: "" })).toThrow();
  });
});

describe("parseDeviceAttributes", () => {
  const sample = plist.build({
    UDID: "EB0C563DCA21A2F9C20C14EDA73B42453C75B4E7",
    PRODUCT: "iPhone10,4",
    VERSION: "20H100",
    DEVICE_NAME: "养号机-01",
    SERIAL: "F2L...",
  } as any);

  it("取出 UDID（归一为小写）及型号/系统", () => {
    const a = parseDeviceAttributes(sample);
    expect(a.udid).toBe("eb0c563dca21a2f9c20c14eda73b42453c75b4e7");
    expect(a.product).toBe("iPhone10,4");
    expect(a.version).toBe("20H100");
    expect(a.deviceName).toBe("养号机-01");
  });

  it("接受 Buffer 输入", () => {
    expect(parseDeviceAttributes(Buffer.from(sample, "utf8")).udid).toMatch(/^eb0c/);
  });

  it("缺 UDID 抛错", () => {
    const bad = plist.build({ PRODUCT: "iPhone10,4" } as any);
    expect(() => parseDeviceAttributes(bad)).toThrow(/UDID/);
  });
});
