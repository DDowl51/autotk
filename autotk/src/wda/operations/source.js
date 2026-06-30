"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = source;
const client_1 = require("../client");
const session_1 = require("../session");
/**
 * 获取当前界面的可访问性元素树（XML）。
 * 用于按元素而非硬编码坐标来定位按钮，是机型自适配的核心。
 */
function source() {
    return (0, client_1.request)((0, session_1.sessionPath)("/source"));
}
