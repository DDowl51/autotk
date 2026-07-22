// 收视频端极小 App:连 master、后台保活、收命令下载存相册,大字显示状态(供人眼 + master 的 VLM 读)。
// 纯逻辑在 src/agent.ts / src/downloader.ts(有测);本文件是装配 + UI,真机验。
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { createReceiverAgent } from "./src/agent";
import { downloadToAlbum } from "./src/downloader";
import { saveUrlToAlbum } from "./src/album";
import { createSocketClient } from "./src/socketClient";
import { createKeepalive } from "./src/keepalive";
import type { ReceiverProgress } from "./src/protocol";

// 每台装机时配:master 收视频通道地址 + 本机 udid(= Hub/编号)。
const MASTER_URL = process.env.EXPO_PUBLIC_MASTER_URL ?? "http://192.168.1.9:4610";
const UDID = process.env.EXPO_PUBLIC_UDID ?? "unset-udid";

const LABEL: Record<ReceiverProgress["status"] | "idle", string> = {
  idle: "待命",
  downloading: "下载中…",
  downloaded: "已存相册 ✓",
  failed: "失败 ✗",
};

export default function App() {
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<ReceiverProgress["status"] | "idle">("idle");
  const [detail, setDetail] = useState("");
  const clientRef = useRef<ReturnType<typeof createSocketClient> | null>(null);

  useEffect(() => {
    const client = createSocketClient({ masterUrl: MASTER_URL, udid: UDID, onConnectionChange: setConnected });
    clientRef.current = client;
    const keepalive = createKeepalive((m) => setDetail(m));

    const agent = createReceiverAgent({
      download: (cmd) => downloadToAlbum(cmd.url, cmd.videoName, { saveUrlToAlbum }),
      sendProgress: (p) => {
        setStatus(p.status);
        setDetail(p.error ?? p.taskId);
        client.sendProgress(p); // 回报 master
      },
      log: (m) => setDetail(m),
    });

    client.connect(agent);
    void keepalive.start();
    return () => {
      client.disconnect();
      void keepalive.stop();
    };
  }, []);

  return (
    <View style={[styles.root, status === "failed" && styles.rootFail]}>
      <StatusBar style="light" />
      <Text style={styles.title}>autotk 收视频端</Text>
      <Text style={styles.status}>{LABEL[status]}</Text>
      <Text style={styles.conn}>{connected ? "● 已连 master" : "○ 未连 master"}</Text>
      <Text style={styles.detail}>{detail}</Text>
      <Text style={styles.udid}>{UDID}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#111", alignItems: "center", justifyContent: "center", padding: 24 },
  rootFail: { backgroundColor: "#4a1414" },
  title: { color: "#888", fontSize: 16, marginBottom: 12 },
  status: { color: "#fff", fontSize: 40, fontWeight: "700", marginBottom: 16 },
  conn: { color: "#9cf", fontSize: 18, marginBottom: 24 },
  detail: { color: "#bbb", fontSize: 14, textAlign: "center" },
  udid: { color: "#555", fontSize: 12, position: "absolute", bottom: 24 },
});
