"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.windowSize = windowSize;
const client_1 = require("../client");
const session_1 = require("../session");
/** 当前窗口(屏幕)逻辑尺寸。 */
function windowSize() {
    return (0, client_1.request)((0, session_1.sessionPath)("/window/size"));
}
