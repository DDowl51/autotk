import { LicenseError } from "./sdk/errors";

/**
 * 心跳失败后是否要踢回激活页：
 * 仅当被远程封禁 / 未激活时才踢；网络/超时/服务端错 → 离线宽限，保留当前激活态。
 */
export function shouldDeactivate(err: unknown): boolean {
  return err instanceof LicenseError && (err.code === "revoked" || err.code === "not_activated");
}

/** 把激活/心跳错误转成给用户看的中文提示。 */
export function activationErrorMessage(err: unknown): string {
  if (!(err instanceof LicenseError)) return "出错了，请稍后重试";
  switch (err.code) {
    case "code_not_found":
      return "激活码无效，请检查后重试";
    case "disabled":
      return "该激活码已被停用";
    case "expired":
      return "该激活码已过期";
    case "device_limit":
      return "该激活码可绑定的设备数已用完";
    case "revoked":
      return "本设备已被解绑，请联系管理员";
    case "product_not_found":
      return "产品配置有误，请联系管理员";
    case "timeout":
      return "请求超时，请检查网络后重试";
    case "network":
      return "网络不可用，请检查网络后重试";
    case "server":
      return "服务器繁忙，请稍后重试";
    case "bad_request":
      return "请输入有效的激活码";
    default:
      return "激活失败，请重试";
  }
}
