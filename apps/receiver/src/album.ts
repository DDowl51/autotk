import type { DownloadDeps } from "./downloader";

// RN/Metro 运行时提供 require;声明一下以通过 tsc(本包 types:[] 不引 @types/node)。
declare const require: (moduleName: string) => any;

/**
 * RN 侧:把远端视频下载并写入相册。抢救自旧 autotk src/publish/album.ts。依赖两个原生模块:
 *   npx expo install expo-file-system expo-media-library
 * 用 require 懒加载,避免在没装这两个模块的环境(如纯逻辑 vitest)里报错——本文件不被测试引入。
 *
 * 关键:FileSystem.downloadAsync **原生流式**直接落盘(字节不进 JS 堆、无手写 base64、不阻塞 JS 线程),
 * 再存进相册,最后删临时文件。旧法(fetch 全量 arrayBuffer + base64 + 不删临时)在大视频上卡死/OOM。
 */
export const saveUrlToAlbum: DownloadDeps["saveUrlToAlbum"] = async (url, fileName) => {
  // ⚠️ SDK 54 的 expo-file-system(v19) 默认导出换成新 File API;老的 cacheDirectory/downloadAsync/deleteAsync 移到 /legacy。
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const FileSystem = require("expo-file-system/legacy");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const MediaLibrary = require("expo-media-library");

  const perm = await MediaLibrary.requestPermissionsAsync();
  if (!perm?.granted) throw new Error("没有相册写入权限");

  const path = `${FileSystem.cacheDirectory}${fileName}`;
  try {
    const res = await FileSystem.downloadAsync(url, path); // 原生流式落盘,不进 JS 内存
    if (!res || res.status !== 200) throw new Error(`下载失败：HTTP ${res?.status ?? "?"}`);
    const asset = await MediaLibrary.createAssetAsync(path); // 复制进相册(await 后原文件可删)
    return asset?.uri ?? asset?.id ?? path;
  } finally {
    try {
      await FileSystem.deleteAsync(path, { idempotent: true });
    } catch {
      /* 清理失败忽略 */
    }
  }
};
