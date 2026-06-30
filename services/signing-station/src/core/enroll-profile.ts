import plist from "plist";

/**
 * UDID 采集描述文件（Apple「Profile Service」.mobileconfig）的纯生成 + 设备回传解析。
 *
 * 流程：手机装这个描述文件 → iOS 把一份【含 UDID/型号/系统版本的 plist】POST 回 callbackUrl
 * （外层是 PKCS#7 签名，**解签由适配器做**；这里只负责生成描述文件、以及解析**已解签**的 plist）。
 *
 * 注意：真正分发前这个 .mobileconfig 还要再被「签名」一次（mobileconfig-sign 适配器，让它显示"已验证"）。
 * 本模块产出的是**未签名的描述文件主体**。
 */

export interface EnrollProfileInput {
  /** 设备回传 UDID 的 https 地址（POST）。 */
  callbackUrl: string;
  /** 组织名，显示在描述文件信息里。 */
  organization: string;
  /** 描述文件唯一标识（reverse-dns，如 com.ddowl.signing-station.enroll）。 */
  identifier: string;
  /** PayloadUUID，由调用方给（便于确定性与测试）。 */
  uuid: string;
  /** 安装时显示的名字，默认「设备登记」。 */
  displayName?: string;
}

function assertHttps(url: string, what: string): void {
  if (!/^https:\/\//i.test(url)) {
    throw new Error(`${what} 必须是 https，收到：${url}`);
  }
}

/** 生成 Profile Service .mobileconfig 主体（未签名）。 */
export function buildEnrollProfile(input: EnrollProfileInput): string {
  assertHttps(input.callbackUrl, "callbackUrl");
  if (!input.identifier) throw new Error("identifier 不能为空");
  if (!input.uuid) throw new Error("uuid 不能为空");

  return plist.build({
    PayloadContent: {
      URL: input.callbackUrl,
      DeviceAttributes: ["UDID", "PRODUCT", "VERSION", "DEVICE_NAME", "SERIAL"],
    },
    PayloadOrganization: input.organization,
    PayloadDisplayName: input.displayName ?? "设备登记",
    PayloadVersion: 1,
    PayloadUUID: input.uuid,
    PayloadIdentifier: input.identifier,
    PayloadType: "Profile Service",
    PayloadDescription: "安装后将本机标识用于 App 签名授权。",
  } as unknown as plist.PlistValue);
}

export interface DeviceAttributes {
  udid: string;
  product?: string;
  version?: string;
  deviceName?: string;
  serial?: string;
}

/**
 * 解析设备回传的（**已解签的**）plist，取出 UDID 等。
 * Profile Service 回传的键是大写：UDID / PRODUCT / VERSION / DEVICE_NAME / SERIAL。
 */
export function parseDeviceAttributes(plistXml: string | Buffer): DeviceAttributes {
  const text = typeof plistXml === "string" ? plistXml : plistXml.toString("utf8");
  const parsed = plist.parse(text) as Record<string, unknown>;
  const udidRaw = parsed["UDID"];
  if (typeof udidRaw !== "string" || udidRaw.trim() === "") {
    throw new Error("设备回传里缺少 UDID");
  }
  const str = (k: string): string | undefined => {
    const v = parsed[k];
    return typeof v === "string" && v !== "" ? v : undefined;
  };
  return {
    udid: udidRaw.trim().toLowerCase(),
    product: str("PRODUCT"),
    version: str("VERSION"),
    deviceName: str("DEVICE_NAME"),
    serial: str("SERIAL"),
  };
}
