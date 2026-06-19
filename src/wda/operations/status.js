"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = status;
const client_1 = require("../client");
/** 查询 WDA 状态（无需 session）。 */
function status() {
    return (0, client_1.request)("/status");
}
