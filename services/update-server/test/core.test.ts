import { describe, it, expect } from "vitest";
import { generateKeyPairSync, createVerify } from "node:crypto";
import { sha256UrlSafeBase64, sha256Hex, hexToUuid } from "../src/core/hash";
import { buildManifest, contentTypeForExt } from "../src/core/manifest";
import { signManifest } from "../src/core/sign";

describe("hash", () => {
  it("url-safe base64 无 +/= ", () => {
    const h = sha256UrlSafeBase64(Buffer.from("hello"));
    expect(h).not.toMatch(/[+/=]/);
    expect(h.length).toBeGreaterThan(0);
  });
  it("hexToUuid 格式 8-4-4-4-12", () => {
    expect(hexToUuid(sha256Hex(Buffer.from("x")))).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});

describe("manifest", () => {
  const asset = (hash: string) => ({ hash, key: "k", contentType: "application/javascript", url: "u" });
  it("id 由内容派生：bundle 变则 id 变，不变则稳定", () => {
    const m1 = buildManifest({ runtimeVersion: "1.0.0", createdAt: "2020-01-01T00:00:00.000Z", launchAsset: asset("aaa"), assets: [] });
    const m2 = buildManifest({ runtimeVersion: "1.0.0", createdAt: "2099-01-01T00:00:00.000Z", launchAsset: asset("aaa"), assets: [] });
    const m3 = buildManifest({ runtimeVersion: "1.0.0", createdAt: "2020-01-01T00:00:00.000Z", launchAsset: asset("bbb"), assets: [] });
    expect(m1.id).toBe(m2.id); // 内容相同（createdAt 不入 id）→ id 稳定
    expect(m1.id).not.toBe(m3.id); // bundle hash 变 → id 变
    expect(m1.runtimeVersion).toBe("1.0.0");
    expect(m1.metadata).toEqual({});
  });
  it("contentTypeForExt 常见类型", () => {
    expect(contentTypeForExt("png")).toBe("image/png");
    expect(contentTypeForExt(".ttf")).toBe("font/ttf");
    expect(contentTypeForExt("hbc")).toBe("application/javascript");
    expect(contentTypeForExt("weird")).toBe("application/octet-stream");
  });
});

describe("sign", () => {
  it("signManifest 产出可被公钥验证的 RSA-SHA256 签名 + 正确的结构化头", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    const manifestString = JSON.stringify({ id: "x", runtimeVersion: "1.0.0" });
    const header = signManifest(manifestString, privateKey, "main");
    expect(header).toMatch(/^sig="[^"]+", keyid="main", alg="rsa-v1_5-sha256"$/);
    const sig = /sig="([^"]+)"/.exec(header)![1];
    const ok = createVerify("RSA-SHA256").update(manifestString).verify(publicKey, sig, "base64");
    expect(ok).toBe(true);
    // 篡改 manifest → 验签失败
    const bad = createVerify("RSA-SHA256").update(manifestString + "x").verify(publicKey, sig, "base64");
    expect(bad).toBe(false);
  });
});
