import { spawn } from "node:child_process";
import { readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

/**
 * 解出设备回传的 plist：Profile Service 回传的是 PKCS#7（DER）签名包，内含 UDID 等的 plist。
 * 用 `openssl smime -verify -noverify -inform DER` 拆出内容（-noverify：我们只取数据，不校证书链）。
 * 已是裸 plist XML（测试/某些场景）直接透传。命令行拼装纯函数可测；IO 注入测分支。
 */

export function looksLikePlistXml(text: string): boolean {
  return /^\s*(<\?xml|<!DOCTYPE\s+plist|<plist)/i.test(text);
}

export function buildSmimeVerifyArgs(o: { inPath: string; outPath: string }): string[] {
  return ["smime", "-verify", "-noverify", "-inform", "DER", "-in", o.inPath, "-out", o.outPath];
}

export interface RunResult {
  code: number;
  stderr: string;
}
export type Runner = (bin: string, args: string[]) => Promise<RunResult>;

const defaultRunner: Runner = (bin, args) =>
  new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("error", reject);
    p.on("close", (code) => resolve({ code: code ?? -1, stderr: err }));
  });

interface Io {
  write: (path: string, data: Buffer) => Promise<void>;
  read: (path: string) => Promise<Buffer>;
  remove: (path: string) => Promise<void>;
}
const defaultIo: Io = {
  write: (p, d) => writeFile(p, d),
  read: (p) => readFile(p),
  remove: (p) => rm(p, { force: true }),
};

export interface DevicePlistOpts {
  opensslBin?: string;
  workDir: string;
}

export class DevicePlistExtractor {
  constructor(
    private readonly opts: DevicePlistOpts,
    private readonly runner: Runner = defaultRunner,
    private readonly io: Io = defaultIo,
  ) {}

  async extract(body: Buffer): Promise<string> {
    const text = body.toString("utf8");
    if (looksLikePlistXml(text)) return text;

    const stem = join(this.opts.workDir, `dev-${randomBytes(6).toString("hex")}`);
    const inPath = `${stem}.p7`;
    const outPath = `${stem}.plist`;
    await this.io.write(inPath, body);
    try {
      const args = buildSmimeVerifyArgs({ inPath, outPath });
      const r = await this.runner(this.opts.opensslBin ?? "openssl", args);
      if (r.code !== 0) throw new Error(`解 PKCS#7 失败 (code ${r.code})：${r.stderr.slice(0, 300)}`);
      return (await this.io.read(outPath)).toString("utf8");
    } finally {
      await this.io.remove(inPath);
      await this.io.remove(outPath);
    }
  }
}
