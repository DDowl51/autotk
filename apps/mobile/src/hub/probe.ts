// 轻量探测某地址是不是「我们的控制中心」：打 Hub 的 /whoami，返回体含 svc="autotk-hub" 即是。
// 用于端口兜底重连时筛掉「该端口被别的程序（甚至别的 socket.io 服务）占着」的情况——
// 只发一个 GET、不建立设备连接、无副作用。fetchImpl 可注入便于单测；默认全局 fetch，超时 2.5s。
// 注：早先用 socket.io 握手体含 "sid" 判定，但任何 socket.io 服务都含 sid，认错风险高 →
// 改用 Hub 专属的 /whoami 身份端点（svc 标识与自动发现广播一致）。

type ProbeResponse = { ok: boolean; text(): Promise<string> };
type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<ProbeResponse>;

export async function probeHub(url: string, fetchImpl: FetchLike = fetch, timeoutMs = 2500): Promise<boolean> {
  const base = url.replace(/\/$/, "");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetchImpl(`${base}/whoami`, { signal: ctrl.signal });
    if (!r.ok) return false;
    const text = await r.text();
    return text.includes('"autotk-hub"'); // /whoami 返回 {"svc":"autotk-hub"} → 确是我们的 Hub
  } catch {
    return false; // 连不上 / 超时 / 不是我们的服务
  } finally {
    clearTimeout(t);
  }
}
