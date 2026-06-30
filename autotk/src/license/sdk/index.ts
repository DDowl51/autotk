// Vendored from license-saas/packages/sdk —— 保持同步。
export { LicenseClient } from "./client";
export type { LicenseClientOptions, StoredLicense, ActivateResult } from "./client";
export { LicenseError } from "./errors";
export type { LicenseErrorCode } from "./errors";
export { MemoryStorage } from "./storage";
export type { LicenseStorage } from "./storage";
export { signRequest, makeNonce } from "./signing";
export type { SignParts } from "./signing";
