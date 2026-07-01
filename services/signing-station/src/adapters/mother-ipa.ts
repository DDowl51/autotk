import { spawn } from "node:child_process";

/**
 * 母包体检：确认 apps/*.ipa 是有效 WDA/App 包。
 * 踩过的坑：WDA 母包放错成「缺 XCTest 框架」的版本 → 签出来装上是空壳点不开（还白排查几小时）。
 * 这里在 `npm run check` 阶段就把它揪出来。
 *
 * 列条目（unzip -Z1）是 IO，注入便于测；归纳逻辑是纯函数，重点单测。
 */

export interface IpaSummary {
  appBundle?: string; // 如 WebDriverAgentRunner-Runner.app
  frameworks: string[]; // .app/Frameworks 下的 *.framework 名
  hasXctestFrameworks: boolean; // 含 XCTest.framework（WDA 跑测试必需）
  hasXctestPlugin: boolean; // 含 PlugIns/*.xctest
  entryCount: number;
}

export interface IpaInspection extends IpaSummary {
  exists: boolean;
}

/** 从 zip 条目名归纳出包结构（纯函数）。 */
export function summarizeIpaEntries(entries: string[]): IpaSummary {
  const appMatch = entries.map((e) => e.match(/^Payload\/([^/]+\.app)\//)).find(Boolean);
  const appBundle = appMatch?.[1];

  const fw = new Set<string>();
  let hasXctestPlugin = false;
  for (const e of entries) {
    const m = e.match(/\.app\/Frameworks\/([^/]+\.framework)\//);
    if (m) fw.add(m[1]);
    if (/\.app\/PlugIns\/[^/]+\.xctest\//.test(e)) hasXctestPlugin = true;
  }
  const frameworks = [...fw].sort();
  return {
    appBundle,
    frameworks,
    hasXctestFrameworks: frameworks.some((f) => /^XCTest\.framework$/i.test(f)),
    hasXctestPlugin,
    entryCount: entries.length,
  };
}

export type ZipLister = (path: string) => Promise<string[]>;

const defaultLister: ZipLister = (path) =>
  new Promise((resolve, reject) => {
    const p = spawn("unzip", ["-Z1", path], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0
        ? resolve(out.split("\n").map((s) => s.trim()).filter(Boolean))
        : reject(new Error(`unzip -Z1 失败 (code ${code})`)),
    );
  });

export class MotherIpaInspector {
  constructor(private readonly lister: ZipLister = defaultLister) {}

  async inspect(path: string): Promise<IpaInspection> {
    let entries: string[];
    try {
      entries = await this.lister(path);
    } catch {
      // 文件不存在 / 不是有效 zip → unzip 失败，统一当「坏母包」。
      return { exists: false, frameworks: [], hasXctestFrameworks: false, hasXctestPlugin: false, entryCount: 0 };
    }
    return { exists: true, ...summarizeIpaEntries(entries) };
  }
}
