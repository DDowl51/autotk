"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TIKTOK_BUNDLE_ID = void 0;
exports.getSessionId = getSessionId;
exports.sessionPath = sessionPath;
exports.createSession = createSession;
exports.applyFastSettings = applyFastSettings;
exports.deleteSession = deleteSession;
const client_1 = require("./client");
/** TikTok 国际版 bundle id。 */
exports.TIKTOK_BUNDLE_ID = "com.zhiliaoapp.musically";
let sessionId = null;
function getSessionId() {
    return sessionId;
}
/** 把 session 相对路径拼成完整路径，未建会话时抛错。 */
function sessionPath(suffix) {
    if (!sessionId) {
        throw new Error("WDA session 未建立，请先调用 createSession()");
    }
    return `/session/${sessionId}${suffix}`;
}
/**
 * 创建会话。默认创建「空会话」（不绑定 bundleId、不启动 App），创建很快；
 * 之后用 activateApp() 把目标 App 切到前台即可。
 * 传 bundleId 则会在建会话时启动该 App（较慢，一般不需要）。
 */
async function createSession(bundleId) {
    const alwaysMatch = {
        "appium:shouldWaitForQuiescence": false,
    };
    if (bundleId)
        alwaysMatch["appium:bundleId"] = bundleId;
    const value = await (0, client_1.request)("/session", {
        method: "POST",
        body: JSON.stringify({ capabilities: { alwaysMatch } }),
    });
    sessionId = value.sessionId;
    return sessionId;
}
/**
 * 应用关键提速设置（建会话后调用）。返回 WDA 实际生效的 settings，便于核对。
 * - waitForIdleTimeout / animationCoolOffTimeout = 0：
 *   TikTok 视频一直在播、界面永不静止，否则每次操作前后都等到默认 60s 超时。
 * - snapshotMaxDepth：限制元素树深度，减少抓取耗时。
 */
function applyFastSettings() {
    return (0, client_1.request)(`/session/${sessionId}/appium/settings`, {
        method: "POST",
        body: JSON.stringify({
            settings: {
                waitForIdleTimeout: 0,
                animationCoolOffTimeout: 0,
                shouldWaitForQuiescence: false,
                shouldUseCompactResponses: true,
                // 关键：TikTok 视图树极大，深快照会触发 kAXErrorIPCTimeout（>20s）。
                // 实测深度 1 时点击约 0.5s。坐标点击不需要深树，故默认压到 1。
                snapshotMaxDepth: 1,
            },
        }),
    });
}
/** 关闭当前会话。 */
async function deleteSession() {
    if (!sessionId)
        return;
    await (0, client_1.request)(`/session/${sessionId}`, { method: "DELETE" });
    sessionId = null;
}
