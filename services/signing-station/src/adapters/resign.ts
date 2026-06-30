import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import type { ResignPort, SignInput } from "../core/ports";

/**
 * 重签适配器：shell-out `zsign`（Linux 用 p12 + 描述文件重签母包）。
 * 命令行拼装是纯函数（可测）；真正 spawn 注入 runner，便于测成功/失败分支而不跑 zsign。
 */

export interface AccountP12 {
  p12Path: string;
  p12Password: string;
}
export type CredsResolver = (accountName: string) => AccountP12;

export interface RunResult {
  code: number;
  stderr: string;
}
export type Runner = (bin: string, args: string[]) => Promise<RunResult>;

/** zsign 参数：`zsign -k p12 -p pass -m profile -o out mother.ipa`。 */
export function buildZsignArgs(o: {
  p12Path: string;
  p12Password: string;
  profilePath: string;
  motherIpaPath: string;
  outPath: string;
}): string[] {
  return ["-k", o.p12Path, "-p", o.p12Password, "-m", o.profilePath, "-o", o.outPath, o.motherIpaPath];
}

const defaultRunner: Runner = (bin, args) =>
  new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("error", reject);
    p.on("close", (code) => resolve({ code: code ?? -1, stderr: err }));
  });

export interface ResignOpts {
  zsignBin?: string;
  /** 输出 IPA 的临时目录。 */
  workDir: string;
}

export class ZsignResign implements ResignPort {
  constructor(
    private readonly creds: CredsResolver,
    private readonly opts: ResignOpts,
    private readonly runner: Runner = defaultRunner,
    private readonly read: (path: string) => Promise<Buffer> = (p) => readFile(p),
  ) {}

  async sign(input: SignInput): Promise<Buffer> {
    const { p12Path, p12Password } = this.creds(input.accountName);
    const outPath = join(
      this.opts.workDir,
      `${input.accountName}-${input.app.key}-${randomBytes(6).toString("hex")}.ipa`,
    );
    const args = buildZsignArgs({
      p12Path,
      p12Password,
      profilePath: input.profile.path,
      motherIpaPath: input.app.motherIpaPath,
      outPath,
    });
    const r = await this.runner(this.opts.zsignBin ?? "zsign", args);
    if (r.code !== 0) {
      throw new Error(`zsign 失败 (code ${r.code})：${r.stderr.slice(0, 500)}`);
    }
    return this.read(outPath);
  }
}
