export type LicenseErrorCode =
  // 传输层
  | "network"
  | "timeout"
  | "server"
  | "invalid_response"
  | "bad_request"
  // 业务拒绝（服务端返回的 reason，确定性、不应重试）
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
  /** 是否可重试（仅传输层瞬时错误）。 */
  get retryable(): boolean {
    return RETRYABLE.has(this.code);
  }
}

/** 把服务端 4xx 的 reason 映射成错误码；未知则 bad_request。 */
export function mapReason(reason: unknown): LicenseErrorCode {
  return typeof reason === "string" && REASONS.has(reason)
    ? (reason as LicenseErrorCode)
    : "bad_request";
}
