"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = screenshot;
const client_1 = require("../client");
/**
 * 截取当前屏幕，返回 base64 编码的 PNG（无需 session）。
 * 后续用于 Vision OCR 机型自适配、风控弹窗识别等。
 */
function screenshot() {
    return (0, client_1.request)("/screenshot");
}
