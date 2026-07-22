import type { PublishSource } from "../hub/protocol";

/**
 * 把视频从来源（同网 lan 直链 / 跨网 relay 中转链）下载下来、写入手机相册。
 * 纯逻辑，把「下载+写相册」抽象成一个可注入依赖，便于单测；
 * 真机上 RN 侧注入 expo-file-system 流式下载落盘 + expo-media-library 存相册。
 *
 * ⚠️ 不再把整段视频 fetch 进 JS 内存再手写 base64（旧法内存峰值约视频体积 3 倍、
 * 且 base64 编码在 JS 线程上阻塞、临时文件不清理）——大视频会卡死甚至 OOM 崩溃。
 * 改为原生流式下载直接落盘，字节不进 JS 堆。
 */
export interface DownloadDeps {
  /** 把远端视频下载并存入相册，返回可供发布用的本地资源标识（uri/assetId）。失败抛错。 */
  saveUrlToAlbum: (url: string, fileName: string) => Promise<string>;
}

export type DownloadResult = { ok: true; assetUri: string } | { ok: false; error: string };

export async function downloadToAlbum(
  source: PublishSource,
  videoName: string,
  deps: DownloadDeps,
): Promise<DownloadResult> {
  try {
    const assetUri = await deps.saveUrlToAlbum(source.url, videoName);
    return { ok: true, assetUri };
  } catch (e) {
    return { ok: false, error: `下载或写入相册失败：${e instanceof Error ? e.message : String(e)}` };
  }
}
