/**
 * 发布配置校验（纯逻辑，供运行时门禁与构建期脚本共用）。
 * 交付版必须由环境变量填好激活服务地址与产品 key/secret，不能带占位符出厂。
 */

export interface LicenseCfg {
  baseUrl: string;
  productKey: string;
  productSecret: string;
}

/** 返回未配置好的问题列表（空数组 = 已就绪）。 */
export function releaseConfigErrors(cfg: LicenseCfg): string[] {
  const errors: string[] = [];
  if (!cfg.baseUrl || cfg.baseUrl.includes("your-license-server")) {
    errors.push("激活服务地址未配置");
  }
  if (!cfg.productKey || cfg.productKey.startsWith("FILL_")) {
    errors.push("产品 key 未配置");
  }
  if (!cfg.productSecret || cfg.productSecret.startsWith("FILL_")) {
    errors.push("产品 secret 未配置");
  }
  return errors;
}
