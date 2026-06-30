import plist from "plist";

/**
 * OTA 安装清单（manifest.plist）的纯生成逻辑。
 *
 * iOS 通过 `itms-services://?action=download-manifest&url=<manifest.plist 的 https 地址>`
 * 触发安装。系统读 manifest 里的 software-package 资产地址去下 IPA，按 metadata 显示标题/版本。
 *
 * 硬性约束（Apple）：IPA 地址、清单地址都必须是 **https**。这里在生成期就把关，避免上线才发现装不了。
 */
export interface ManifestInput {
  /** 签名后 IPA 的 https 下载地址。 */
  ipaUrl: string;
  /** 应用 bundle id（如 com.ddowl.WebDriverAgentRunner.xctrunner）。 */
  bundleId: string;
  /** 版本号，显示用，随便给个有意义的（如 5.15.5 / 构建时间）。 */
  version: string;
  /** 安装时显示的标题。 */
  title: string;
  /** 可选：安装气泡里的小图标（57x57，https）。 */
  displayImageUrl?: string;
  /** 可选：大图标（512x512，https）。 */
  fullSizeImageUrl?: string;
}

function assertHttps(url: string, what: string): void {
  if (!/^https:\/\//i.test(url)) {
    throw new Error(`${what} 必须是 https（OTA 安装强制），收到：${url}`);
  }
}

interface Asset {
  kind: string;
  url: string;
}

/** 生成 manifest.plist 的 XML 文本。 */
export function buildManifest(input: ManifestInput): string {
  assertHttps(input.ipaUrl, "IPA 地址");
  if (input.displayImageUrl) assertHttps(input.displayImageUrl, "display-image 地址");
  if (input.fullSizeImageUrl) assertHttps(input.fullSizeImageUrl, "full-size-image 地址");
  if (!input.bundleId) throw new Error("bundleId 不能为空");

  const assets: Asset[] = [{ kind: "software-package", url: input.ipaUrl }];
  if (input.displayImageUrl) assets.push({ kind: "display-image", url: input.displayImageUrl });
  if (input.fullSizeImageUrl) assets.push({ kind: "full-size-image", url: input.fullSizeImageUrl });

  // plist 库要求普通对象；用 as 兜住 plist 的宽松类型。
  return plist.build({
    items: [
      {
        assets,
        metadata: {
          "bundle-identifier": input.bundleId,
          "bundle-version": input.version,
          kind: "software",
          title: input.title,
        },
      },
    ],
  } as unknown as plist.PlistValue);
}

/** 由 manifest.plist 的 https 地址拼出可点击的 itms-services 安装链接。 */
export function itmsServicesUrl(manifestUrl: string): string {
  assertHttps(manifestUrl, "manifest 地址");
  return `itms-services://?action=download-manifest&url=${encodeURIComponent(manifestUrl)}`;
}
