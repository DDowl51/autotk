/**
 * 开发者面板可见性。
 * 交付给非技术买家的发行版默认隐藏「调试」Tab 与 WDA 连接诊断；
 * 卖家自测时可在构建期置 EXPO_PUBLIC_DEV_TOOLS=1 打开。
 * 纯函数（不读全局），便于单测；调用处传入 __DEV__ 与环境变量。
 */
export function isDeveloperMode(isDev: boolean, envFlag: string | undefined): boolean {
  return isDev || envFlag === "1";
}
