/**
 * 全局错误兜底：捕获未处理的 JS 错误与 promise 拒绝，记日志但不让 App 静默崩。
 * RN 的主要崩溃路径是 ErrorUtils 全局 handler；promise 拒绝的钩子各环境不一，尽力而为。
 */
export function installGlobalErrorHandlers(): void {
  const g = global as unknown as {
    ErrorUtils?: {
      getGlobalHandler?: () => ((e: unknown, isFatal?: boolean) => void) | undefined;
      setGlobalHandler?: (h: (e: unknown, isFatal?: boolean) => void) => void;
    };
    addEventListener?: (type: string, cb: (ev: unknown) => void) => void;
  };

  try {
    const prev = g.ErrorUtils?.getGlobalHandler?.();
    g.ErrorUtils?.setGlobalHandler?.((e, isFatal) => {
      // eslint-disable-next-line no-console
      console.error(`未捕获错误${isFatal ? "（致命）" : ""}：`, e);
      prev?.(e, isFatal); // 保留 RN 原处理（dev 红屏等）
    });
  } catch {
    /* ErrorUtils 不可用 → 跳过 */
  }

  try {
    g.addEventListener?.("unhandledrejection", (ev) => {
      const reason = (ev as { reason?: unknown } | undefined)?.reason ?? ev;
      // eslint-disable-next-line no-console
      console.error("未处理的 promise 拒绝：", reason);
    });
  } catch {
    /* 该环境无此事件 → 跳过 */
  }
}
