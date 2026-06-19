"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TIKTOK_BUNDLE_ID = exports.applyFastSettings = exports.getSessionId = exports.deleteSession = exports.createSession = exports.WdaError = exports.setTimeout_ = exports.getBaseUrl = exports.setBaseUrl = void 0;
// WDA 客户端公共 API。
var client_1 = require("./client");
Object.defineProperty(exports, "setBaseUrl", { enumerable: true, get: function () { return client_1.setBaseUrl; } });
Object.defineProperty(exports, "getBaseUrl", { enumerable: true, get: function () { return client_1.getBaseUrl; } });
Object.defineProperty(exports, "setTimeout_", { enumerable: true, get: function () { return client_1.setTimeout_; } });
Object.defineProperty(exports, "WdaError", { enumerable: true, get: function () { return client_1.WdaError; } });
var session_1 = require("./session");
Object.defineProperty(exports, "createSession", { enumerable: true, get: function () { return session_1.createSession; } });
Object.defineProperty(exports, "deleteSession", { enumerable: true, get: function () { return session_1.deleteSession; } });
Object.defineProperty(exports, "getSessionId", { enumerable: true, get: function () { return session_1.getSessionId; } });
Object.defineProperty(exports, "applyFastSettings", { enumerable: true, get: function () { return session_1.applyFastSettings; } });
Object.defineProperty(exports, "TIKTOK_BUNDLE_ID", { enumerable: true, get: function () { return session_1.TIKTOK_BUNDLE_ID; } });
__exportStar(require("./operations"), exports);
