/**
 * 给 Promise 加超时（纯逻辑，便于单测）。
 * 用于给引擎每批模块套上限：WDA 卡住/无响应时超时抛错，进既有退避重试，
 * 而不是让整批永久挂住。原 Promise 仍在后台跑，但引擎已不再等它。
 */
export function withTimeout<T>(p: Promise<T>, seconds: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`模块超时（${seconds}s 无响应）`)), seconds * 1000);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}
