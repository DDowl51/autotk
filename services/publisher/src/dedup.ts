import type { VideoItem, Manifest } from "./types";

// 去重：靠「文件名 + 大小」指纹判断是否已发过（不读文件内容，快且够用；
// 改名或改内容都会变指纹、视为新文件）。纯函数，便于单测。

export function fileKey(item: Pick<VideoItem, "fileName" | "size">): string {
  return `${item.fileName}#${item.size}`;
}

export function isPublished(manifest: Manifest, item: VideoItem): boolean {
  return fileKey(item) in manifest.published;
}

/** 从扫描结果里筛掉已发布的，得到「待发」列表。 */
export function filterUnpublished(items: VideoItem[], manifest: Manifest): VideoItem[] {
  return items.filter((it) => !isPublished(manifest, it));
}

export function markPublished(manifest: Manifest, item: VideoItem, now = Date.now()): Manifest {
  return { published: { ...manifest.published, [fileKey(item)]: now } };
}

export const emptyManifest = (): Manifest => ({ published: {} });
