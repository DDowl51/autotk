import type { DownloadDeps } from "./downloader";

// RN/Metro 运行时提供 require；声明一下以通过 tsc（项目未引入 @types/node）。
declare const require: (moduleName: string) => any;

/**
 * RN 侧：把视频字节写入手机相册。依赖两个原生模块：
 *   npx expo install expo-file-system expo-media-library
 * 用 require 懒加载，避免在没装这两个模块的环境（如纯 Node 单测）里报错——
 * 本文件不被测试套件引入，真机/Mac 构建时才走到。
 */

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Uint8Array → base64（RN/Hermes 无 Buffer，手写编码）。 */
function toBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? B64[((b1 & 15) << 2) | (b2 >> 6)] : "=";
    out += i + 2 < bytes.length ? B64[b2 & 63] : "=";
  }
  return out;
}

/** 注入给 downloader 的相册写入实现：写临时文件 → 存入相册 → 返回资源 uri。 */
export const saveBytesToAlbum: DownloadDeps["saveToAlbum"] = async (bytes, fileName) => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const FileSystem = require("expo-file-system");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const MediaLibrary = require("expo-media-library");

  const perm = await MediaLibrary.requestPermissionsAsync();
  if (!perm?.granted) throw new Error("没有相册写入权限");

  const path = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(path, toBase64(bytes), {
    encoding: FileSystem.EncodingType.Base64,
  });
  const asset = await MediaLibrary.createAssetAsync(path);
  return asset?.uri ?? asset?.id ?? path;
};
