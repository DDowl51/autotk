"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = go_home;
const client_1 = require("../client");
/** 回到 iOS 主屏幕（无需 session）。 */
function go_home() {
    return (0, client_1.request)("/wda/homescreen", { method: "POST" });
}
