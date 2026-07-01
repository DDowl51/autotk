import { useState } from "react";
import { SafeAreaView, View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { COLORS } from "./fields";
import { parseHubQr } from "../hub/hubUrl";

/**
 * 连接控制中心：扫电脑「控制中心」设置页的二维码，或手动输入地址。
 * 相机需真机（expo-camera 原生模块）。
 */
export function HubConnectScreen({
  current,
  onConnect,
  onClose,
}: {
  current: string;
  onConnect: (url: string) => void;
  onClose: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState(current);
  const [msg, setMsg] = useState("");
  const [locked, setLocked] = useState(false); // 扫到后短暂锁定，避免连扫

  const accept = (raw: string) => {
    const url = parseHubQr(raw);
    if (!url) {
      setMsg("这不是有效的控制中心二维码/地址");
      return;
    }
    onConnect(url);
    onClose();
  };

  const onScanned = ({ data }: { data: string }) => {
    if (locked) return;
    setLocked(true);
    accept(data);
    setTimeout(() => setLocked(false), 1500);
  };

  return (
    <SafeAreaView style={styles.root}>
      <Text style={styles.title}>连接控制中心</Text>
      <Text style={styles.sub}>把电脑「控制中心」设置页里的二维码对准扫描</Text>

      <View style={styles.camWrap}>
        {permission?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={onScanned}
          />
        ) : (
          <View style={styles.permBox}>
            <Text style={styles.permText}>需要相机权限来扫码</Text>
            <TouchableOpacity style={styles.btn} onPress={requestPermission} activeOpacity={0.85}>
              <Text style={styles.btnText}>允许使用相机</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <Text style={styles.or}>或手动输入地址</Text>
      <TextInput
        style={styles.input}
        value={manual}
        onChangeText={setManual}
        placeholder="http://192.168.x.x:4000"
        placeholderTextColor="#7a7f8a"
        autoCapitalize="none"
        autoCorrect={false}
      />
      {msg ? <Text style={styles.err}>{msg}</Text> : null}

      <TouchableOpacity style={styles.btn} onPress={() => accept(manual)} activeOpacity={0.85}>
        <Text style={styles.btnText}>连接</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
        <Text style={styles.closeText}>关闭</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg, padding: 20 },
  title: { color: COLORS.text, fontSize: 20, fontWeight: "800", marginTop: 8 },
  sub: { color: COLORS.sub, fontSize: 13, marginTop: 6, marginBottom: 16 },
  camWrap: {
    height: 280,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#000",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  permBox: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  permText: { color: COLORS.sub, fontSize: 14 },
  or: { color: COLORS.faint, fontSize: 12, textAlign: "center", marginVertical: 16 },
  input: {
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 10,
    color: COLORS.text,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  err: { color: "#f87171", fontSize: 13, marginTop: 10 },
  btn: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 16,
  },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  closeBtn: { paddingVertical: 14, alignItems: "center", marginTop: 4 },
  closeText: { color: COLORS.sub, fontSize: 14 },
});
