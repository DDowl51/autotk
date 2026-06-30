"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.elementId = elementId;
exports.findElements = findElements;
exports.findFirst = findFirst;
const client_1 = require("../client");
const session_1 = require("../session");
/** 从 WDA 返回的元素引用里取出元素 id。 */
function elementId(e) {
    return e.ELEMENT ?? e["element-6066-11e4-a52e-4f735466cecf"] ?? "";
}
/** 查找匹配的所有元素，返回元素 id 列表。 */
async function findElements(using, value) {
    const res = await (0, client_1.request)((0, session_1.sessionPath)("/elements"), {
        method: "POST",
        body: JSON.stringify({ using, value }),
    });
    return res.map(elementId).filter(Boolean);
}
/** 查找第一个匹配的元素，没有则返回 null（不抛错）。 */
async function findFirst(using, value) {
    const ids = await findElements(using, value);
    return ids[0] ?? null;
}
