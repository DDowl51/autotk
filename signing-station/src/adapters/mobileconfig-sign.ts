import { spawn } from "node:child_process";
import { readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

/**
 * 给 .mobileconfig 加签（CMS/PKCS#7），让手机安装时显示「已验证」。
 * 用 `openssl smime -sign ... -outform der -nodetach`。命令行拼装纯函数可测；IO 注入便于测分支。
 *
 * 证书来源：用一张「能被 iOS 信任」的证书链给描述文件签名（通常是域名 TLS 证书或受信 CA 签发的代码签名证书）。
 * 与「给 IPA 重签的 Apple Dev 证书」是两回事，别混。真机阶段验「已验证」徽标。
 */

export interface MobileconfigSigner {
  /** 输入未签名 mobileconfig（XML 文本），输出已签名 DER 字节（application/x-apple-aspen-config）。 */
  sign(unsignedXml: string): Promise<Buffer>;
}

export interface SmimeCreds {
  /** 签名证书（PEM）。 */
  signerCertPath: string;
  /** 私钥（PEM）。 */
  keyPath: string;
  /** 可选中间证书链（PEM）。 */
  certChainPath?: string;
}

export function buildOpensslSmimeArgs(o: {
  inPath: string;
  outPath: string;
  signerCertPath: string;
  keyPath: string;
  certChainPath?: string;
}): string[] {
  const args = [
    "smime",
    "-sign",
    "-in",
    o.inPath,
    "-out",
    o.outPath,
    "-signer",
    o.signerCertPath,
    "-inkey",
    o.keyPath,
    "-outform",
    "der",
    "-nodetach",
  ];
  if (o.certChainPath) args.push("-certfile", o.certChainPath);
  return args;
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

export interface OpensslSignerOpts {
  opensslBin?: string;
  workDir: string;
}

interface Io {
  write: (path: string, data: string) => Promise<void>;
  read: (path: string) => Promise<Buffer>;
  remove: (path: string) => Promise<void>;
}
const defaultIo: Io = {
  write: (p, d) => writeFile(p, d, "utf8"),
  read: (p) => readFile(p),
  remove: (p) => rm(p, { force: true }),
};

export class OpensslMobileconfigSigner implements MobileconfigSigner {
  constructor(
    private readonly creds: SmimeCreds,
    private readonly opts: OpensslSignerOpts,
    private readonly runner: Runner = defaultRunner,
    private readonly io: Io = defaultIo,
  ) {}

  async sign(unsignedXml: string): Promise<Buffer> {
    const stem = join(this.opts.workDir, `mc-${randomBytes(6).toString("hex")}`);
    const inPath = `${stem}.in.mobileconfig`;
    const outPath = `${stem}.signed.mobileconfig`;
    await this.io.write(inPath, unsignedXml);
    try {
      const args = buildOpensslSmimeArgs({
        inPath,
        outPath,
        signerCertPath: this.creds.signerCertPath,
        keyPath: this.creds.keyPath,
        certChainPath: this.creds.certChainPath,
      });
      const r = await this.runner(this.opts.opensslBin ?? "openssl", args);
      if (r.code !== 0) throw new Error(`openssl smime 失败 (code ${r.code})：${r.stderr.slice(0, 500)}`);
      return await this.io.read(outPath);
    } finally {
      await this.io.remove(inPath);
      await this.io.remove(outPath);
    }
  }
}
