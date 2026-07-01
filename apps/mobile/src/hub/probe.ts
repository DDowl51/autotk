// 轻量探测某地址是不是「我们的控制中心」：打 socket.io 握手端点，返回体含 sid 即是。
// 用于端口兜底重连时筛掉「该端口被别的程序占着」的情况——不建立设备连接、无副作用。
// fetchImpl 可注入便于单测；默认用全局 fetch，超时 2.5s。

type ProbeResponse = { ok: boolean; text(): Promise<string> };
type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<ProbeResponse>;

export async function probeHub(url: string, fetchImpl: FetchLike = fetch, timeoutMs = 2500): Promise<boolean> {
  const base = url.replace(/\/$/, "");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetchImpl(`${base}/socket.io/?EIO=4&transport=polling`, { signal: ctrl.signal });
    if (!r.ok) return false;
    const text = await r.text();
    return text.includes('"sid"'); // socket.io 握手 open 包形如 0{"sid":"..."}
  } catch {
    return false; // 连不上 / 超时 / 不是我们的服务
  } finally {
    clearTimeout(t);
  }
}
