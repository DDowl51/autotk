"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = tap;
const client_1 = require("../client");
const session_1 = require("../session");
/**
 * 在屏幕坐标 (x, y) 处单击。
 * 用 W3C Actions 端点（新版 WDA 已移除旧的 /wda/tap/0）。
 */
function tap(p) {
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    return (0, client_1.request)((0, session_1.sessionPath)("/actions"), {
        method: "POST",
        body: JSON.stringify({
            actions: [
                {
                    type: "pointer",
                    id: "finger1",
                    parameters: { pointerType: "touch" },
                    actions: [
                        { type: "pointerMove", duration: 0, x, y },
                        { type: "pointerDown", button: 0 },
                        { type: "pause", duration: 60 },
                        { type: "pointerUp", button: 0 },
                    ],
                },
            ],
        }),
    });
}
