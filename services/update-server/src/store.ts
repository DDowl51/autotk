import { promises as fs } from "node:fs";
import path from "node:path";
import { buildManifest, contentTypeForExt, type ExpoManifest, type ManifestAsset } from "./core/manifest";
import { sha256UrlSafeBase64 } from "./core/hash";

interface ExportAsset {
  path: string;
  ext: string;
}
interface ExportMetadata {
  fileMetadata?: Record<string, { bundle: string; assets: ExportAsset[] }>;
}

/**
 * 更新仓库：磁盘布局 `UPDATES_DIR/<runtimeVersion>/<更新文件夹>/`，
 * 每个更新文件夹里放一次 `npx expo export` 的产物（metadata.json + _expo/ + assets/）。
 * 同一 runtimeVersion 下取**最新（按 mtime）**的更新文件夹作为「当前应下发的版本」。
 */
export class UpdateStore {
  constructor(
    private readonly updatesDir: string,
    private readonly baseUrl: string,
  ) {}

  private rvDir(rv: string): string {
    return path.join(this.updatesDir, rv);
  }

  private async latestFolder(rv: string): Promise<string | null> {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(this.rvDir(rv), { withFileTypes: true });
    } catch {
      return null;
    }
    let best: { name: string; mtime: number } | null = null;
    for (const d of entries) {
      if (!d.isDirectory()) continue;
      const st = await fs.stat(path.join(this.rvDir(rv), d.name));
      if (!best || st.mtimeMs > best.mtime) best = { name: d.name, mtime: st.mtimeMs };
    }
    return best?.name ?? null;
  }

  /** 某 runtimeVersion + 平台的最新 manifest；无更新则 null。 */
  async latestManifest(rv: string, platform: string): Promise<ExpoManifest | null> {
    const folder = await this.latestFolder(rv);
    if (!folder) return null;
    const base = path.join(this.rvDir(rv), folder);
    let meta: ExportMetadata;
    try {
      meta = JSON.parse(await fs.readFile(path.join(base, "metadata.json"), "utf8")) as ExportMetadata;
    } catch {
      return null;
    }
    const section = meta.fileMetadata?.[platform];
    if (!section?.bundle) return null;

    const assetUrl = (rel: string): string =>
      `${this.baseUrl}/assets/${encodeURIComponent(rv)}/${encodeURIComponent(folder)}/` +
      rel.split("/").map(encodeURIComponent).join("/");
    const hashFile = async (rel: string): Promise<string> =>
      sha256UrlSafeBase64(await fs.readFile(path.join(base, rel)));

    const launchAsset: ManifestAsset = {
      hash: await hashFile(section.bundle),
      key: path.basename(section.bundle),
      contentType: "application/javascript",
      fileExtension: path.extname(section.bundle) || ".js",
      url: assetUrl(section.bundle),
    };
    const assets: ManifestAsset[] = [];
    for (const a of section.assets ?? []) {
      assets.push({
        hash: await hashFile(a.path),
        key: path.basename(a.path),
        contentType: contentTypeForExt(a.ext),
        fileExtension: "." + a.ext.replace(/^\./, ""),
        url: assetUrl(a.path),
      });
    }
    const st = await fs.stat(base);
    return buildManifest({
      runtimeVersion: rv,
      createdAt: new Date(st.mtimeMs).toISOString(),
      launchAsset,
      assets,
    });
  }

  /** 读某更新下的资源文件（供 /assets 路由）。含路径穿越防护：解析后必须仍在 updatesDir 内。 */
  async readAsset(rv: string, folder: string, rel: string): Promise<Buffer | null> {
    const root = path.resolve(this.updatesDir);
    const target = path.resolve(root, rv, folder, rel);
    if (target !== root && !target.startsWith(root + path.sep)) return null; // 防 ../ 穿越
    try {
      return await fs.readFile(target);
    } catch {
      return null;
    }
  }
}
