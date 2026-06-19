"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tapElement = tapElement;
exports.elementText = elementText;
exports.elementAttribute = elementAttribute;
exports.elementRect = elementRect;
exports.elementCenter = elementCenter;
exports.setElementValue = setElementValue;
const client_1 = require("../client");
const session_1 = require("../session");
/** 点击指定元素。 */
function tapElement(elementId) {
    return (0, client_1.request)((0, session_1.sessionPath)(`/element/${elementId}/click`), {
        method: "POST",
        body: "{}",
    });
}
/** 读取元素文本。 */
function elementText(elementId) {
    return (0, client_1.request)((0, session_1.sessionPath)(`/element/${elementId}/text`));
}
/** 读取元素的指定属性（如 "label"、"value"、"name"、"visible"）。 */
function elementAttribute(elementId, name) {
    return (0, client_1.request)((0, session_1.sessionPath)(`/element/${elementId}/attribute/${name}`));
}
/** 读取元素的位置与尺寸。 */
function elementRect(elementId) {
    return (0, client_1.request)((0, session_1.sessionPath)(`/element/${elementId}/rect`));
}
/** 元素中心点坐标，便于按坐标点击/滑动。 */
async function elementCenter(elementId) {
    const r = await elementRect(elementId);
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}
/** 向元素输入文本（元素需可接受输入）。 */
function setElementValue(elementId, text) {
    return (0, client_1.request)((0, session_1.sessionPath)(`/element/${elementId}/value`), {
        method: "POST",
        body: JSON.stringify({ value: [...text] }),
    });
}
