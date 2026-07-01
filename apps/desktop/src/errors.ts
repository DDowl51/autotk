// 把底层报错转成人话 + 补救建议。纯函数，便于单测。

export type ErrorCtx = "analytics" | "scan" | "publish" | "qr" | "generic";

function friendly(raw: string): string {
  const r = raw.trim();
  if (!r) return "未知错误";
  return r.length > 80 ? r.slice(0, 80) + "…" : r; // 太技术/太长的原始串截断
}

export function humanizeError(e: unknown, ctx: ErrorCtx = "generic"): string {
  const raw = e instanceof Error ? e.message : String(e ?? "");
  const low = raw.toLowerCase();
  const net = /econnrefused|refused|failed to fetch|networkerror|network error|enotfound|etimedout|timeout|network/.test(low);
  const perm = /eacces|eperm|permission|denied|access is denied/.test(low);
  const notfound = /enoent|no such file|not found|404/.test(low);

  switch (ctx) {
    case "analytics":
      if (net) return "读取失败：连不上采集服务，请检查「设置 → 埋点采集地址」";
      return "读取失败：" + friendly(raw);
    case "scan":
      if (perm) return "扫描失败：没有权限访问该文件夹，换个位置或以管理员身份打开";
      if (notfound) return "扫描失败：找不到该文件夹，请重新选择视频根目录";
      return "扫描失败：" + friendly(raw);
    case "publish":
      if (net) return "发布失败：网络异常，请检查手机与本电脑的连接";
      return "发布失败：" + friendly(raw);
    case "qr":
      if (net || notfound) return "二维码生成失败：拿不到本机局域网地址，请检查是否连着 WiFi";
      return "二维码生成失败：" + friendly(raw);
    default:
      return friendly(raw);
  }
}
