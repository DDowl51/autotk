import { describe, it, expect } from "vitest";
import plist from "plist";
import { buildManifest, itmsServicesUrl } from "../src/core/manifest";

describe("buildManifest", () => {
  const base = {
    ipaUrl: "https://install.example.com/ota/ipa/abc",
    bundleId: "com.ddowl.WebDriverAgentRunner.xctrunner",
    version: "5.15.5",
    title: "WebDriverAgent",
  };

  it("生成的 plist 含正确的 software-package 资产与 metadata", () => {
    const xml = buildManifest(base);
    const parsed = plist.parse(xml) as any;
    const item = parsed.items[0];
    expect(item.assets[0]).toMatchObject({ kind: "software-package", url: base.ipaUrl });
    expect(item.metadata).toMatchObject({
      "bundle-identifier": base.bundleId,
      "bundle-version": "5.15.5",
      kind: "software",
      title: "WebDriverAgent",
    });
  });

  it("带图标时追加 display-image / full-size-image 资产", () => {
    const xml = buildManifest({
      ...base,
      displayImageUrl: "https://install.example.com/i57.png",
      fullSizeImageUrl: "https://install.example.com/i512.png",
    });
    const kinds = (plist.parse(xml) as any).items[0].assets.map((a: any) => a.kind);
    expect(kinds).toEqual(["software-package", "display-image", "full-size-image"]);
  });

  it("非 https 的 IPA 地址直接抛错（OTA 强制 https）", () => {
    expect(() => buildManifest({ ...base, ipaUrl: "http://x/y.ipa" })).toThrow(/https/);
  });

  it("空 bundleId 抛错", () => {
    expect(() => buildManifest({ ...base, bundleId: "" })).toThrow();
  });
});

describe("itmsServicesUrl", () => {
  it("拼出 download-manifest 链接并对 url 编码", () => {
    const u = itmsServicesUrl("https://install.example.com/ota/wda/manifest.plist?s=tok");
    expect(u).toBe(
      "itms-services://?action=download-manifest&url=" +
        encodeURIComponent("https://install.example.com/ota/wda/manifest.plist?s=tok"),
    );
  });

  it("非 https 抛错", () => {
    expect(() => itmsServicesUrl("http://x/m.plist")).toThrow(/https/);
  });
});
