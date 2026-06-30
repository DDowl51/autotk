"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.touchTap = touchTap;
exports.touchSwipe = touchSwipe;
const client_1 = require("../client");
const session_1 = require("../session");
/**
 * 通过 /wda/touch/perform（MJSONWP 触摸动作）在坐标处单击。
 * 与 W3C /actions 是不同的代码路径，某些 WDA 版本上更快/更可靠。
 */
function touchTap(p) {
    return (0, client_1.request)((0, session_1.sessionPath)("/wda/touch/perform"), {
        method: "POST",
        body: JSON.stringify({
            actions: [
                { action: "tap", options: { x: Math.round(p.x), y: Math.round(p.y) } },
            ],
        }),
    });
}
/** 通过 /wda/touch/perform 实现滑动（press → wait → moveTo → release）。 */
function touchSwipe(from, to, durationMs = 250) {
    return (0, client_1.request)((0, session_1.sessionPath)("/wda/touch/perform"), {
        method: "POST",
        body: JSON.stringify({
            actions: [
                { action: "press", options: { x: Math.round(from.x), y: Math.round(from.y) } },
                { action: "wait", options: { ms: durationMs } },
                { action: "moveTo", options: { x: Math.round(to.x), y: Math.round(to.y) } },
                { action: "release", options: {} },
            ],
        }),
    });
}
