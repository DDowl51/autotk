export { signRequest, verifyRequest, type SignParts } from "./signing";
export { generateCode, normalizeCode, formatCode } from "./codes";
export { generateProductKey, generateSecret } from "./secrets";
export { bucketByDay, statusBreakdown, type DayCount, type StatusCount } from "./stats";
export {
  decideActivation,
  type ActivateDecision,
  type CodeState,
  type DeviceBinding,
} from "./rules";
export { isProductAllowed, visibleCodes, type Role } from "./whitelist";
export {
  createThrottleState,
  lockedSeconds,
  recordFailure,
  recordSuccess,
  DEFAULT_THROTTLE,
  type ThrottleState,
  type ThrottleOpts,
} from "./login-throttle";
