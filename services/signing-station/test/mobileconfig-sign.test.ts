import { describe, it, expect } from "vitest";
import { buildOpensslSmimeArgs, OpensslMobileconfigSigner, type Runner } from "../src/adapters/mobileconfig-sign";

describe("buildOpensslSmimeArgs", () => {
  it("基本参数（der + nodetach）", () => {
    const a = buildOpensslSmimeArgs({
      inPath: "in",
      outPath: "out",
      signerCertPath: "cert.pem",
      keyPath: "key.pem",
    });
    expect(a.slice(0, 2)).toEqual(["smime", "-sign"]);
    expect(a).toContain("-outform");
    expect(a).toContain("der");
    expect(a).toContain("-nodetach");
    expect(a).not.toContain("-certfile");
  });

  it("带证书链时追加 -certfile", () => {
    const a = buildOpensslSmimeArgs({
      inPath: "in",
      outPath: "out",
      signerCertPath: "cert.pem",
      keyPath: "key.pem",
      certChainPath: "chain.pem",
    });
    expect(a).toContain("-certfile");
    expect(a).toContain("chain.pem");
  });
});

describe("OpensslMobileconfigSigner.sign", () => {
  const creds = { signerCertPath: "c.pem", keyPath: "k.pem" };

  it("成功：写入→openssl(0)→读出 DER；并清理临时文件", async () => {
    const writes: string[] = [];
    const removed: string[] = [];
    const runner: Runner = async () => ({ code: 0, stderr: "" });
    const io = {
      write: async (p: string) => {
        writes.push(p);
      },
      read: async () => Buffer.from("DER"),
      remove: async (p: string) => {
        removed.push(p);
      },
    };
    const s = new OpensslMobileconfigSigner(creds, { workDir: "/tmp" }, runner, io);
    const out = await s.sign("<xml/>");
    expect(out.toString()).toBe("DER");
    expect(writes.length).toBe(1);
    expect(removed.length).toBe(2); // in + out 都清掉
  });

  it("失败：openssl code≠0 抛错，仍清理临时文件", async () => {
    const removed: string[] = [];
    const runner: Runner = async () => ({ code: 2, stderr: "no key" });
    const io = {
      write: async () => {},
      read: async () => Buffer.from(""),
      remove: async (p: string) => {
        removed.push(p);
      },
    };
    const s = new OpensslMobileconfigSigner(creds, { workDir: "/tmp" }, runner, io);
    await expect(s.sign("<xml/>")).rejects.toThrow(/no key/);
    expect(removed.length).toBe(2);
  });
});
