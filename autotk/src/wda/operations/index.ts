// 原子操作 barrel。
export { default as status } from "./status";
export { default as go_home } from "./go_home";
export { default as tap } from "./tap";
export { default as swipe } from "./swipe";
export { default as typeText } from "./typeText";
export { default as screenshot } from "./screenshot";
export { default as source } from "./source";
export { default as pressButton } from "./pressButton";
export type { HardwareButton } from "./pressButton";
export {
  findElements,
  findFirst,
  elementId,
  type Using,
} from "./findElements";
export {
  tapElement,
  elementText,
  elementAttribute,
  elementRect,
  elementCenter,
  setElementValue,
  type Rect,
} from "./element";
export { windowSize } from "./window";
export { activateApp } from "./activateApp";
export { touchTap, touchSwipe } from "./touchPerform";
export { getSettings, updateSettings } from "./settings";
export {
  alertText,
  alertButtons,
  alertClickButton,
  alertDismiss,
  alertAccept,
} from "./alert";
