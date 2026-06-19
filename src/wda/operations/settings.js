"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSettings = getSettings;
exports.updateSettings = updateSettings;
const client_1 = require("../client");
const session_1 = require("../session");
/** 读取当前会话的 WDA settings。 */
function getSettings() {
    return (0, client_1.request)((0, session_1.sessionPath)("/appium/settings"));
}
/** 更新 WDA settings，返回更新后的完整 settings。 */
function updateSettings(settings) {
    return (0, client_1.request)((0, session_1.sessionPath)("/appium/settings"), {
        method: "POST",
        body: JSON.stringify({ settings }),
    });
}
