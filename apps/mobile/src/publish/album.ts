import type { DownloadDeps } from "./downloader";

// RN/Metro 运行时提供 require；声明一下以通过 tsc（项目未引入 @types/node）。
declare const require: (moduleName: string) => any;

/**
 * RN 侧：把远端视频下载并写入手机相册。依赖两个原生模块：
 *   npx expo install expo-file-system expo-media-library
 * 用 require 懒加载，避免在没装这两个模块的环境（如纯 Node 单测）里报错——
 * 本文件不被测试套件引入，真机/Mac 构建时才走到。
 *
 * 关键：用 FileSystem.downloadAsync **原生流式**把视频直接落盘（字节不进 JS 堆、无手写 base64、
 * 不阻塞 JS 线程），再存进相册，最后删掉临时文件。旧法（fetch 全量 arrayBuffer + 手写 base64 +
 * 从不删临时文件）在几十~上百 MB 视频上会卡死 UI、甚至触发低端机 OOM 崩溃。
 */
export const saveUrlToAlbum: DownloadDeps["saveUrlToAlbum"] = async (url, fileName) => {
  // ⚠️ SDK 54 的 expo-file-system(v19) 默认导出换成了新 File API，老的
  // cacheDirectory/downloadAsync/deleteAsync 移到了 /legacy 子路径。
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const FileSystem = require("expo-file-system/legacy");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const MediaLibrary = require("expo-media-library");

  const perm = await MediaLibrary.requestPermissionsAsync();
  if (!perm?.granted) throw new Error("没有相册写入权限");

  const path = `${FileSystem.cacheDirectory}${fileName}`;
  try {
    const res = await FileSystem.downloadAsync(url, path); // 原生流式落盘，不进 JS 内存
    if (!res || res.status !== 200) throw new Error(`下载失败：HTTP ${res?.status ?? "?"}`);
    const asset = await MediaLibrary.createAssetAsync(path); // 复制进相册（await 后原文件可删）
    return asset?.uri ?? asset?.id ?? path;
  } finally {
    // 临时文件已进相册，删掉避免缓存逐条累积；idempotent 不抛（文件可能没下下来）。
    try {
      await FileSystem.deleteAsync(path, { idempotent: true });
    } catch {
      /* 清理失败忽略 */
    }
  }
};
