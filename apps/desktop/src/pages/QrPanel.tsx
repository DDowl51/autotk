import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { getHubApi } from "../hub-ipc";
import { C } from "../theme";

/** 「手机扫码连本机控制中心」二维码，编码 http://<局域网IP>:<端口>。 */
export function QrPanel() {
  const [dataUrl, setDataUrl] = useState("");
  const [addr, setAddr] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    const api = getHubApi();
    if (!api) return;
    let alive = true;
    void (async () => {
      try {
        const [ip, port] = await Promise.all([api.getLanIp(), api.getPort()]);
        const url = `http://${ip}:${port}`;
        const png = await QRCode.toDataURL(url, { width: 200, margin: 1 });
        if (!alive) return;
        setAddr(url);
        setDataUrl(png);
      } catch (e) {
        if (alive) setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (err) return <div style={{ color: "#fca5a5", fontSize: 13 }}>二维码生成失败：{err}</div>;
  if (!dataUrl) return <div style={{ color: C.faint, fontSize: 13 }}>生成二维码中…</div>;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <img
        src={dataUrl}
        width={160}
        height={160}
        alt="扫码连接"
        style={{ background: "#fff", padding: 8, borderRadius: 8 }}
      />
      <div style={{ fontSize: 13, color: C.dim, lineHeight: 2 }}>
        <div>手机装好 App 后，在 App 的「连接控制中心」里扫这个码即可连上。</div>
        <div>手机需与本电脑连同一个 WiFi。</div>
        <div style={{ color: C.faint }}>
          地址：<code>{addr}</code>
        </div>
      </div>
    </div>
  );
}
