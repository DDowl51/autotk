import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateKeyPairSync, createVerify } from "node:crypto";
import { buildServer } from "../src/server";
import type { Config } from "../src/config";

// 造一个假的 `expo export` 产物：<dir>/1.0.0/build-1/{metadata.json,_expo/...hbc,assets/img1}
async function seedUpdate(dir: string): Promise<void> {
  const base = path.join(dir, "1.0.0", "build-1");
  await fs.mkdir(path.join(base, "_expo", "static", "js", "ios"), { recursive: true });
  await fs.mkdir(path.join(base, "assets"), { recursive: true });
  await fs.writeFile(path.join(base, "_expo", "static", "js", "ios", "bundle.hbc"), "JS_BUNDLE_BYTES");
  await fs.writeFile(path.join(base, "assets", "img1"), "PNG_BYTES");
  await fs.writeFile(
    path.join(base, "metadata.json"),
    JSON.stringify({
      version: 0,
      bundler: "metro",
      fileMetadata: {
        ios: { bundle: "_expo/static/js/ios/bundle.hbc", assets: [{ path: "assets/img1", ext: "png" }] },
      },
    }),
  );
}

function parseMultipart(body: string): { manifest: any; signature: string | null } {
  const sigMatch = /expo-signature:\s*([^\r\n]+)/.exec(body);
  const jsonMatch = /\r\n\r\n(\{[\s\S]*\})\r\n--/.exec(body);
  return { manifest: JSON.parse(jsonMatch![1]), signature: sigMatch ? sigMatch[1] : null };
}

describe("update-server /api/manifest + /assets", () => {
  let tmp: string;
  let keys: { privateKey: string; publicKey: string };

  beforeAll(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "upd-"));
    await seedUpdate(tmp);
    keys = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
  });
  afterAll(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  const cfg = (): Config => ({
    port: 0,
    updatesDir: tmp,
    baseUrl: "https://u.test",
    privateKeyPem: keys.privateKey,
    keyid: "main",
  });

  it("返回 multipart manifest，字段/URL/签名都对，asset 可下载且验签通过", async () => {
    const app = buildServer(cfg());
    const res = await app.inject({
      method: "GET",
      url: "/api/manifest",
      headers: { "expo-platform": "ios", "expo-runtime-version": "1.0.0", "expo-expect-signature": "true" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/^multipart\/mixed; boundary=/);
    expect(res.headers["expo-protocol-version"]).toBe("1");

    const { manifest, signature } = parseMultipart(res.body);
    expect(manifest.runtimeVersion).toBe("1.0.0");
    expect(manifest.launchAsset.url).toBe("https://u.test/assets/1.0.0/build-1/_expo/static/js/ios/bundle.hbc");
    expect(manifest.launchAsset.contentType).toBe("application/javascript");
    expect(manifest.assets).toHaveLength(1);
    expect(manifest.assets[0].contentType).toBe("image/png");
    expect(manifest.id).toMatch(/^[0-9a-f-]{36}$/);

    // 签名验证：对 manifest 字符串用公钥验（服务端签的是 JSON.stringify(manifest)）
    const manifestString = JSON.stringify(manifest);
    const sig = /sig="([^"]+)"/.exec(signature!)![1];
    expect(createVerify("RSA-SHA256").update(manifestString).verify(keys.publicKey, sig, "base64")).toBe(true);

    // 下载 launchAsset（走 /assets 路由，URL 去掉 baseUrl 前缀）
    const assetPath = manifest.launchAsset.url.replace("https://u.test", "");
    const dl = await app.inject({ method: "GET", url: assetPath });
    expect(dl.statusCode).toBe(200);
    expect(dl.body).toBe("JS_BUNDLE_BYTES");
    await app.close();
  });

  it("无该 runtimeVersion 的更新 → 404（客户端保持当前版本）", async () => {
    const app = buildServer(cfg());
    const res = await app.inject({
      method: "GET",
      url: "/api/manifest",
      headers: { "expo-platform": "ios", "expo-runtime-version": "9.9.9" },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("缺 runtimeVersion 头 → 400", async () => {
    const app = buildServer(cfg());
    const res = await app.inject({ method: "GET", url: "/api/manifest", headers: { "expo-platform": "ios" } });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("路径穿越被挡：/assets 读不到 updatesDir 之外的文件", async () => {
    const app = buildServer(cfg());
    const res = await app.inject({ method: "GET", url: "/assets/1.0.0/build-1/..%2f..%2f..%2fetc%2fpasswd" });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
