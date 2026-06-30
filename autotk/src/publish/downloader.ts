import type { PublishSource } from "../hub/protocol";

/**
 * 把视频从来源（同网 lan 直链 / 跨网 relay 中转链）下载下来、写入手机相册。
 * 纯逻辑，把网络与相册写入抽象成可注入依赖，便于单测；
 * 真机上 RN 侧注入 fetch + expo-media-library 的保存实现。
 */
export interface DownloadDeps {
  fetch: (url: string) => Promise<{ ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer> }>;
  /** 把字节存进相册，返回可供发布用的本地资源标识（uri/assetId）。 */
  saveToAlbum: (bytes: Uint8Array, fileName: string) => Promise<string>;
}

export type DownloadResult = { ok: true; assetUri: string } | { ok: false; error: string };

export async function downloadToAlbum(
  source: PublishSource,
  videoName: string,
  deps: DownloadDeps,
): Promise<DownloadResult> {
  let resp: Awaited<ReturnType<DownloadDeps["fetch"]>>;
  try {
    resp = await deps.fetch(source.url);
  } catch (e) {
    return { ok: false, error: `下载失败：${e instanceof Error ? e.message : String(e)}` };
  }
  if (!resp.ok) return { ok: false, error: `下载失败：HTTP ${resp.status}` };

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await resp.arrayBuffer());
  } catch (e) {
    return { ok: false, error: `读取视频字节失败：${e instanceof Error ? e.message : String(e)}` };
  }
  if (bytes.length === 0) return { ok: false, error: "下载到的视频为空" };

  try {
    const assetUri = await deps.saveToAlbum(bytes, videoName);
    return { ok: true, assetUri };
  } catch (e) {
    return { ok: false, error: `写入相册失败：${e instanceof Error ? e.message : String(e)}` };
  }
}
