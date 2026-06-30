"use strict";
// WDA(WebDriverAgent) REST API 底层客户端。
// 协议参考：https://github.com/appium/WebDriverAgent
//
// WDA 在被控 iPhone 上监听 8100 端口。本 App 与 WDA 同机运行，因此走 localhost。
Object.defineProperty(exports, "__esModule", { value: true });
exports.WdaError = void 0;
exports.setBaseUrl = setBaseUrl;
exports.getBaseUrl = getBaseUrl;
exports.setTimeout_ = setTimeout_;
exports.request = request;
let baseUrl = "http://localhost:8100";
let timeoutMs = 20000;
/** 覆盖 WDA 基址（默认 http://localhost:8100）。 */
function setBaseUrl(url) {
    baseUrl = url.replace(/\/+$/, "");
}
function getBaseUrl() {
    return baseUrl;
}
/** 设置单次请求超时（毫秒）。超时后抛错，避免干等到 fetch 默认的 5 分钟。 */
function setTimeout_(ms) {
    timeoutMs = ms;
}
class WdaError extends Error {
    constructor(message, status, path) {
        super(message);
        this.status = status;
        this.path = path;
        this.name = "WdaError";
    }
}
exports.WdaError = WdaError;
/**
 * 向 WDA 发一次请求，返回 value 字段。
 * 非 2xx 或 WDA 返回错误对象时抛 WdaError。
 */
async function request(path, options) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res;
    try {
        res = await fetch(`${baseUrl}${path}`, {
            headers: { "Content-Type": "application/json" },
            signal: ctrl.signal,
            ...options,
        });
    }
    catch (e) {
        if (e instanceof Error && e.name === "AbortError") {
            throw new WdaError(`请求超时(${timeoutMs}ms)`, 0, path);
        }
        throw e;
    }
    finally {
        clearTimeout(timer);
    }
    let body;
    try {
        body = (await res.json());
    }
    catch {
        // 某些端点（如 /screenshot 之外的）总返回 JSON；解析失败按状态码处理。
    }
    if (!res.ok) {
        const msg = body?.value?.message ??
            `WDA ${res.status}`;
        throw new WdaError(msg, res.status, path);
    }
    return body.value;
}
