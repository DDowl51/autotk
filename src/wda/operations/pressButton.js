"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = pressButton;
const client_1 = require("../client");
/**
 * 按下硬件按键（无需 session）。
 * 音量键组合可用于「安全退出自动化」的人工指令识别。
 */
function pressButton(name) {
    return (0, client_1.request)("/wda/pressButton", {
        method: "POST",
        body: JSON.stringify({ name }),
    });
}
