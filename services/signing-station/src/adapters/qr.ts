import QRCode from "qrcode";

/** 生成落地页二维码（SVG 文本，内联进页面或单独路由）。 */
export function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
}

/** data: URL 形式的 PNG（便于直接放进 <img src>）。 */
export function qrPngDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { margin: 1, errorCorrectionLevel: "M", width: 256 });
}
