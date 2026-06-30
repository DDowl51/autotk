"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activateApp = activateApp;
const client_1 = require("../client");
const session_1 = require("../session");
/**
 * 把指定 app 切到前台（不重启，保留当前界面）。
 * WDA 的所有点击/滑动/读取都作用于前台 app，因此操控 TikTok 前必须先激活它。
 */
function activateApp(bundleId) {
    return (0, client_1.request)((0, session_1.sessionPath)("/wda/apps/activate"), {
        method: "POST",
        body: JSON.stringify({ bundleId }),
    });
}
