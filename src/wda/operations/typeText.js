"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = typeText;
const client_1 = require("../client");
const session_1 = require("../session");
/**
 * 向当前聚焦的输入框输入文本（需先点击输入框使其聚焦）。
 * 用于搜索关键词、评论回复等。
 */
function typeText(text) {
    return (0, client_1.request)((0, session_1.sessionPath)("/wda/keys"), {
        method: "POST",
        body: JSON.stringify({ value: [...text] }),
    });
}
