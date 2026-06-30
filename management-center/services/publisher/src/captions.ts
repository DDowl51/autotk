// 文案解析（纯函数）。优先级：同名 .txt > captions.txt 里按文件名映射 > 文件名（去扩展名）。
// captions.txt 每行格式： <文件名> = <文案>   （也支持用冒号或 Tab 分隔）；# 开头为注释。

function stem(fileName: string): string {
  const i = fileName.lastIndexOf(".");
  return i > 0 ? fileName.slice(0, i) : fileName;
}

/** 解析 captions.txt 文本 → 文件名→文案 映射。 */
export function parseCaptionsFile(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(.+?)\s*[=:\t]\s*(.*)$/);
    if (m) map.set(m[1].trim(), m[2].trim());
  }
  return map;
}

export interface CaptionSources {
  /** 同名 .txt 文件的内容（如 video1.mp4 → video1.txt）。 */
  sameNameTxt?: string;
  /** captions.txt 解析出的映射。 */
  captionsMap?: Map<string, string>;
}

/** 解析某视频的文案。全空时回退到去扩展名的文件名。 */
export function resolveCaption(fileName: string, src: CaptionSources = {}): string {
  const same = src.sameNameTxt?.trim();
  if (same) return same;
  const mapped = src.captionsMap?.get(fileName)?.trim();
  if (mapped) return mapped;
  return stem(fileName);
}
