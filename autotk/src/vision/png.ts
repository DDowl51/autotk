import { inflate } from "pako";

export interface DecodedImage {
  width: number;
  height: number;
  /** 反过滤后的原始像素字节，每像素 bpp 字节（RGB=3 / RGBA=4）。 */
  data: Uint8Array;
  bpp: number;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * 纯 JS 解码 PNG（8 位、colorType 2=RGB / 6=RGBA），返回像素字节。
 * 不依赖 Node/系统库，可在 RN 端运行。WDA /screenshot 返回的 PNG 即此格式。
 */
export function decodePng(buf: Uint8Array): DecodedImage {
  // 校验签名。
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) {
    if (buf[i] !== sig[i]) throw new Error("不是 PNG");
  }

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat: Uint8Array[] = [];

  let pos = 8;
  const u32 = (p: number) =>
    ((buf[p] << 24) | (buf[p + 1] << 16) | (buf[p + 2] << 8) | buf[p + 3]) >>> 0;

  while (pos < buf.length) {
    const len = u32(pos);
    const type = String.fromCharCode(buf[pos + 4], buf[pos + 5], buf[pos + 6], buf[pos + 7]);
    const dataStart = pos + 8;
    if (type === "IHDR") {
      width = u32(dataStart);
      height = u32(dataStart + 4);
      bitDepth = buf[dataStart + 8];
      colorType = buf[dataStart + 9];
    } else if (type === "IDAT") {
      idat.push(buf.subarray(dataStart, dataStart + len));
    } else if (type === "IEND") {
      break;
    }
    pos = dataStart + len + 4; // 跳过 data + CRC
  }

  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`不支持的 PNG: bitDepth=${bitDepth} colorType=${colorType}`);
  }
  const bpp = colorType === 6 ? 4 : 3;

  // 合并 IDAT 并 inflate。
  let total = 0;
  for (const c of idat) total += c.length;
  const comp = new Uint8Array(total);
  let off = 0;
  for (const c of idat) {
    comp.set(c, off);
    off += c.length;
  }
  const raw = inflate(comp);

  // 逐行反过滤。
  const stride = width * bpp;
  const out = new Uint8Array(height * stride);
  let src = 0;
  for (let y = 0; y < height; y++) {
    const ft = raw[src++];
    const rowStart = y * stride;
    for (let x = 0; x < stride; x++) {
      const r = raw[src++];
      const a = x >= bpp ? out[rowStart + x - bpp] : 0;
      const b = y > 0 ? out[rowStart - stride + x] : 0;
      const c = x >= bpp && y > 0 ? out[rowStart - stride + x - bpp] : 0;
      let val: number;
      switch (ft) {
        case 0: val = r; break;
        case 1: val = r + a; break;
        case 2: val = r + b; break;
        case 3: val = r + ((a + b) >> 1); break;
        case 4: val = r + paeth(a, b, c); break;
        default: throw new Error(`未知过滤类型 ${ft}`);
      }
      out[rowStart + x] = val & 0xff;
    }
  }

  return { width, height, data: out, bpp };
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64LOOKUP = (() => {
  const t = new Int16Array(256).fill(-1);
  for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i;
  return t;
})();

/** 纯 JS base64 → 字节数组（RN 无 Buffer/atob，故自带）。 */
export function base64ToBytes(s: string): Uint8Array {
  let len = s.length;
  while (len > 0 && (s[len - 1] === "=" || s[len - 1] <= " ")) len--;
  const out = new Uint8Array((len * 3) >> 2);
  let bits = 0;
  let nbits = 0;
  let oi = 0;
  for (let i = 0; i < len; i++) {
    const v = B64LOOKUP[s.charCodeAt(i)];
    if (v < 0) continue;
    bits = (bits << 6) | v;
    nbits += 6;
    if (nbits >= 8) {
      nbits -= 8;
      out[oi++] = (bits >> nbits) & 0xff;
    }
  }
  return oi === out.length ? out : out.subarray(0, oi);
}

/** 取 (x,y) 处像素 RGB。 */
export function pixel(img: DecodedImage, x: number, y: number): {
  r: number;
  g: number;
  b: number;
} {
  const i = (y * img.width + x) * img.bpp;
  return { r: img.data[i], g: img.data[i + 1], b: img.data[i + 2] };
}
