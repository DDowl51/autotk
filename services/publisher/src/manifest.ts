import { promises as fs } from "node:fs";
import path from "node:path";
import { emptyManifest } from "./dedup";
import type { Manifest } from "./types";

// 每设备一份 .published.json，记录已发布过的文件指纹，跨重启去重。

const MANIFEST_NAME = ".published.json";

export function manifestPath(deviceDir: string): string {
  return path.join(deviceDir, MANIFEST_NAME);
}

export async function loadManifest(deviceDir: string): Promise<Manifest> {
  try {
    const raw = await fs.readFile(manifestPath(deviceDir), "utf8");
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" && obj.published ? (obj as Manifest) : emptyManifest();
  } catch {
    return emptyManifest();
  }
}

export async function saveManifest(deviceDir: string, manifest: Manifest): Promise<void> {
  await fs.writeFile(manifestPath(deviceDir), JSON.stringify(manifest, null, 2), "utf8");
}
