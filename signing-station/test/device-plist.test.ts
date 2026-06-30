import { describe, it, expect } from "vitest";
import plist from "plist";
import {
  looksLikePlistXml,
  buildSmimeVerifyArgs,
  DevicePlistExtractor,
  type Runner,
} from "../src/adapters/device-plist";

describe("looksLikePlistXml", () => {
  it("识别 plist XML", () => {
    expect(looksLikePlistXml('<?xml version="1.0"?>\n<plist>')).toBe(true);
    expect(looksLikePlistXml("<plist><dict/></plist>")).toBe(true);
    expect(looksLikePlistXml("\x30\x82binary-der")).toBe(false);
  });
});

describe("buildSmimeVerifyArgs", () => {
  it("verify -noverify -inform DER", () => {
    const a = buildSmimeVerifyArgs({ inPath: "in", outPath: "out" });
    expect(a).toEqual(["smime", "-verify", "-noverify", "-inform", "DER", "-in", "in", "-out", "out"]);
  });
});

describe("DevicePlistExtractor.extract", () => {
  it("已是 plist XML → 直接透传，不跑 openssl", async () => {
    let ran = false;
    const runner: Runner = async () => {
      ran = true;
      return { code: 0, stderr: "" };
    };
    const ex = new DevicePlistExtractor({ workDir: "/tmp" }, runner);
    const xml = plist.build({ UDID: "abc" } as any);
    expect(await ex.extract(Buffer.from(xml))).toContain("UDID");
    expect(ran).toBe(false);
  });

  it("PKCS#7 字节 → 跑 openssl 拆出 plist，并清理临时文件", async () => {
    const removed: string[] = [];
    const runner: Runner = async () => ({ code: 0, stderr: "" });
    const io = {
      write: async () => {},
      read: async () => Buffer.from("<plist><dict><key>UDID</key><string>abc</string></dict></plist>"),
      remove: async (p: string) => {
        removed.push(p);
      },
    };
    const ex = new DevicePlistExtractor({ workDir: "/tmp" }, runner, io);
    const out = await ex.extract(Buffer.from([0x30, 0x82, 0x01]));
    expect(out).toContain("UDID");
    expect(removed.length).toBe(2);
  });

  it("openssl 失败 → 抛错，仍清理", async () => {
    const removed: string[] = [];
    const runner: Runner = async () => ({ code: 4, stderr: "bad der" });
    const io = {
      write: async () => {},
      read: async () => Buffer.from(""),
      remove: async (p: string) => {
        removed.push(p);
      },
    };
    const ex = new DevicePlistExtractor({ workDir: "/tmp" }, runner, io);
    await expect(ex.extract(Buffer.from([0x30, 0x82]))).rejects.toThrow(/bad der/);
    expect(removed.length).toBe(2);
  });
});
