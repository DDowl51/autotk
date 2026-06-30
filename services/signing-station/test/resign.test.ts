import { describe, it, expect } from "vitest";
import { buildZsignArgs, ZsignResign, type Runner } from "../src/adapters/resign";
import type { AppConfig } from "../src/core/ports";

const app: AppConfig = {
  key: "wda",
  bundleId: "com.ddowl.WebDriverAgentRunner.xctrunner",
  title: "WDA",
  version: "5.15.5",
  motherIpaPath: "apps/wda.ipa",
};

describe("buildZsignArgs", () => {
  it("按 zsign 约定排参数，母包在最后", () => {
    expect(
      buildZsignArgs({
        p12Path: "c.p12",
        p12Password: "pw",
        profilePath: "p.mobileprovision",
        motherIpaPath: "m.ipa",
        outPath: "o.ipa",
      }),
    ).toEqual(["-k", "c.p12", "-p", "pw", "-m", "p.mobileprovision", "-o", "o.ipa", "m.ipa"]);
  });
});

describe("ZsignResign.sign", () => {
  const creds = () => ({ p12Path: "a.p12", p12Password: "pw" });

  it("成功：跑 zsign(code 0) 后读出签名 IPA 字节", async () => {
    let calledBin = "";
    let calledArgs: string[] = [];
    const runner: Runner = async (bin, args) => {
      calledBin = bin;
      calledArgs = args;
      return { code: 0, stderr: "" };
    };
    const r = new ZsignResign(creds, { workDir: "/tmp", zsignBin: "zsign" }, runner, async () => Buffer.from("IPA"));
    const out = await r.sign({ accountName: "a", app, profile: { path: "prof.mp", version: "v1" } });
    expect(out.toString()).toBe("IPA");
    expect(calledBin).toBe("zsign");
    expect(calledArgs).toContain("prof.mp");
    expect(calledArgs).toContain("a.p12");
    expect(calledArgs[calledArgs.length - 1]).toBe("apps/wda.ipa");
  });

  it("失败：code≠0 抛错并带 stderr", async () => {
    const runner: Runner = async () => ({ code: 1, stderr: "bad cert" });
    const r = new ZsignResign(creds, { workDir: "/tmp" }, runner, async () => Buffer.from(""));
    await expect(r.sign({ accountName: "a", app, profile: { path: "p", version: "v" } })).rejects.toThrow(/bad cert/);
  });
});
