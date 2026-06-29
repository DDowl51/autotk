// Vendored from license-saas/packages/sdk/src/errors.ts —— 保持同步，勿直接改逻辑。
export type LicenseErrorCode =
  | "network"
  | "timeout"
  | "server"
  | "invalid_response"
  | "bad_request"
  | "product_not_found"
  | "code_not_found"
  | "disabled"
  | "expired"
  | "device_limit"
  | "revoked"
  | "not_activated";

const RETRYABLE: ReadonlySet<LicenseErrorCode> = new Set(["network", "timeout", "server"]);
const REASONS: ReadonlySet<string> = new Set([
  "product_not_found",
  "code_not_found",
  "disabled",
  "expired",
  "device_limit",
  "revoked",
  "not_activated",
]);

export class LicenseError extends Error {
  readonly code: LicenseErrorCode;
  readonly status?: number;
  constructor(code: LicenseErrorCode, message?: string, status?: number) {
    super(message ?? code);
    this.name = "LicenseError";
    this.code = code;
    this.status = status;
  }
  get retryable(): boolean {
    return RETRYABLE.has(this.code);
  }
}

export function mapReason(reason: unknown): LicenseErrorCode {
  return typeof reason === "string" && REASONS.has(reason)
    ? (reason as LicenseErrorCode)
    : "bad_request";
}
