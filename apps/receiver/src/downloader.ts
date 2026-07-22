// 下载视频 + 写入相册(纯逻辑,注入 saveUrlToAlbum → 可测)。抢救自旧 autotk src/publish/downloader.ts。
// ⚠️ 原生流式下载直接落盘(不进 JS 内存再手写 base64)——大视频不卡死/不 OOM,见 album.ts。
export interface DownloadDeps {
  /** 把远端视频下载并存入相册,返回相册资源标识(assetId/uri)。失败抛错。 */
  saveUrlToAlbum: (url: string, fileName: string) => Promise<string>;
}

export type DownloadResult = { ok: true; assetId: string } | { ok: false; error: string };

export async function downloadToAlbum(url: string, videoName: string, deps: DownloadDeps): Promise<DownloadResult> {
  try {
    const assetId = await deps.saveUrlToAlbum(url, videoName);
    return { ok: true, assetId };
  } catch (e) {
    return { ok: false, error: `下载或写入相册失败：${e instanceof Error ? e.message : String(e)}` };
  }
}
