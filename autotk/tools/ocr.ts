import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createWorker, type Worker } from "tesseract.js";
import { screenshot } from "../src/wda";

// 复用一个 OCR worker（首次创建会下载/加载语言模型，较慢；之后很快）。
let workerPromise: Promise<Worker> | null = null;
function getWorker(): Promise<Worker> {
  if (!workerPromise) workerPromise = createWorker("eng");
  return workerPromise;
}

/** 进程退出前调用，否则 worker 线程会让 node 挂着不退出。 */
export async function terminateOcr(): Promise<void> {
  if (workerPromise) {
    const w = await workerPromise;
    await w.terminate();
    workerPromise = null;
  }
}

/** 读 PNG 头里的像素宽高。 */
function pngSize(buf: Buffer): { w: number; h: number } {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function clean(text: string): string {
  return text
    .replace(/\s+/g, " ")
    // 去掉成串的非字母数字噪点（emoji/描边被识别成的乱码）。
    .replace(/[^\p{L}\p{N}#@.,!?'\s-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// 文案区裁剪占比（相对整张截图）。文案在左下、底部锚定、向上生长，
// 故裁一条底部带（留高以容纳 1~3 行）。参数由真机截图离线调得。
const CAP = { x: 0.015, y: 0.78, w: 0.667, h: 0.11 };

/**
 * 读取当前视频文案（推荐页 / 结果页底部左侧的描述文字）。
 *
 * 文案是白字叠在视频上，OCR 难认，故先预处理：裁文案区 → 放大 3x → 灰度 →
 * 阈值提取亮部(白字) → 反相成黑字白底，再喂 tesseract。
 * 注：作者名贴在文案上方、垂直裁不干净，会带进结果，但不影响提示词匹配。
 */
export async function readCaption(W: number, H: number): Promise<string> {
  void W;
  void H;
  const b64 = await screenshot();
  const buf = Buffer.from(b64, "base64");
  const { w: pxW, h: pxH } = pngSize(buf);

  const x = Math.round(CAP.x * pxW);
  const y = Math.round(CAP.y * pxH);
  const cw = Math.round(CAP.w * pxW);
  const ch = Math.round(CAP.h * pxH);

  const tmpIn = path.join(os.tmpdir(), `tk-cap-${Date.now()}.png`);
  const tmpOut = path.join(os.tmpdir(), `tk-cap-${Date.now()}-p.png`);
  fs.writeFileSync(tmpIn, buf);
  try {
    execFileSync("magick", [
      tmpIn,
      "-crop",
      `${cw}x${ch}+${x}+${y}`,
      "+repage",
      "-resize",
      "300%",
      "-colorspace",
      "Gray",
      "-threshold",
      "70%",
      "-negate",
      tmpOut,
    ]);
    const worker = await getWorker();
    const {
      data: { text },
    } = await worker.recognize(tmpOut);
    return clean(text);
  } finally {
    if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn);
    if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
  }
}
