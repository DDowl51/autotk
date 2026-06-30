import { promises as fs } from "node:fs";
import path from "node:path";
import { VIDEO_EXTS, type VideoItem } from "./types";

// 扫描根目录：每个子文件夹名 = 设备名，读出里面的视频文件。

function isVideo(name: string): boolean {
  return (VIDEO_EXTS as readonly string[]).includes(path.extname(name).toLowerCase());
}

/** 扫描根目录下所有「设备子文件夹」里的视频。根目录不存在 → []。 */
export async function scanRoot(rootDir: string): Promise<VideoItem[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(rootDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: VideoItem[] = [];
  for (const dirent of entries) {
    if (!dirent.isDirectory()) continue;
    const deviceName = dirent.name;
    const dir = path.join(rootDir, deviceName);
    out.push(...(await scanDeviceFolder(dir, deviceName)));
  }
  return out;
}

/** 扫描单个设备文件夹的视频（按文件名排序，发布顺序稳定）。 */
export async function scanDeviceFolder(dir: string, deviceName: string): Promise<VideoItem[]> {
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return [];
  }
  const items: VideoItem[] = [];
  for (const fileName of names.sort()) {
    if (!isVideo(fileName)) continue;
    const absPath = path.join(dir, fileName);
    try {
      const st = await fs.stat(absPath);
      if (st.isFile()) {
        items.push({ deviceName, fileName, absPath, size: st.size, mtimeMs: st.mtimeMs });
      }
    } catch {
      /* 文件读取失败跳过 */
    }
  }
  return items;
}

/** 手机首连时自动建 <设备名> 子文件夹。 */
export async function ensureDeviceFolder(rootDir: string, deviceName: string): Promise<string> {
  const dir = path.join(rootDir, deviceName);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/** 读某视频的同名 .txt 文案（不存在 → undefined）。 */
export async function readSameNameTxt(absPath: string): Promise<string | undefined> {
  const txt = absPath.replace(/\.[^.]+$/, ".txt");
  try {
    return await fs.readFile(txt, "utf8");
  } catch {
    return undefined;
  }
}

/** 读设备文件夹下的 captions.txt（不存在 → undefined）。 */
export async function readCaptionsTxt(dir: string): Promise<string | undefined> {
  try {
    return await fs.readFile(path.join(dir, "captions.txt"), "utf8");
  } catch {
    return undefined;
  }
}
