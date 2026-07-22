import { hexToUuid, sha256Hex } from "./hash";

/** 一个静态资源（bundle 或图片/字体）在 manifest 里的条目。 */
export interface ManifestAsset {
  hash: string; // sha256 url-safe base64
  key: string; // 客户端去重用的稳定键（用文件名）
  contentType: string;
  url: string; // 绝对下载地址（指回本服务）
  fileExtension?: string;
}

/** expo-updates 协议的 manifest（protocol version 1）。 */
export interface ExpoManifest {
  id: string;
  createdAt: string;
  runtimeVersion: string;
  launchAsset: ManifestAsset;
  assets: ManifestAsset[];
  metadata: Record<string, unknown>;
  extra: Record<string, unknown>;
}

/** ext → content-type（少量常见类型，够 RN 打包产物用；未知给 octet-stream）。 */
const CONTENT_TYPE: Record<string, string> = {
  js: "application/javascript",
  hbc: "application/javascript",
  json: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  ttf: "font/ttf",
  otf: "font/otf",
  woff: "font/woff",
  woff2: "font/woff2",
  mp4: "video/mp4",
  mp3: "audio/mpeg",
  wav: "audio/wav",
};

export function contentTypeForExt(ext: string): string {
  return CONTENT_TYPE[ext.replace(/^\./, "").toLowerCase()] ?? "application/octet-stream";
}

export interface BuildManifestInput {
  runtimeVersion: string;
  createdAt: string; // ISO 8601
  launchAsset: ManifestAsset;
  assets: ManifestAsset[];
  metadata?: Record<string, unknown>;
  extra?: Record<string, unknown>;
}

/**
 * 组装 manifest。id 由 runtimeVersion + bundle.hash + 各资源 hash 派生（内容不变则 id 不变，
 * 客户端据此判断「已是最新、无需重复下载」；发新版本＝bundle 变＝id 变）。
 */
export function buildManifest(input: BuildManifestInput): ExpoManifest {
  const seed = [input.runtimeVersion, input.launchAsset.hash, ...input.assets.map((a) => a.hash)].join("|");
  return {
    id: hexToUuid(sha256Hex(Buffer.from(seed))),
    createdAt: input.createdAt,
    runtimeVersion: input.runtimeVersion,
    launchAsset: input.launchAsset,
    assets: input.assets,
    metadata: input.metadata ?? {},
    extra: input.extra ?? {},
  };
}
