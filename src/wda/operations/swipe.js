"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = swipe;
const client_1 = require("../client");
const session_1 = require("../session");
/**
 * 从 from 拖拽/滑动到 to，持续 duration 秒。
 * 用 W3C Actions 端点（新版 WDA 已移除旧的 dragfromtoforduration）。
 */
function swipe(from, to, duration = 0.3) {
    const ms = Math.round(duration * 1000);
    return (0, client_1.request)((0, session_1.sessionPath)("/actions"), {
        method: "POST",
        body: JSON.stringify({
            actions: [
                {
                    type: "pointer",
                    id: "finger1",
                    parameters: { pointerType: "touch" },
                    actions: [
                        { type: "pointerMove", duration: 0, x: Math.round(from.x), y: Math.round(from.y) },
                        { type: "pointerDown", button: 0 },
                        { type: "pointerMove", duration: ms, x: Math.round(to.x), y: Math.round(to.y) },
                        { type: "pointerUp", button: 0 },
                    ],
                },
            ],
        }),
    });
}
