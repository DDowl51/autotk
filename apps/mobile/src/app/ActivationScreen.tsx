import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { activationErrorMessage } from "../license/gate";
import { licenseConfigured } from "../license/config";
import { isDeveloperMode } from "./devtools";

export function ActivationScreen({
  onActivate,
  onDevSkip,
}: {
  onActivate: (code: string) => Promise<void>;
  /** 仅测试版传入：点「跳过激活」直接进入。生产发行版不传/不显示。 */
  onDevSkip?: () => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const configured = licenseConfigured();
  // 跳过入口只在测试版出现（与「调试」Tab 同一开关）；生产构建 __DEV__=false 且未置 EXPO_PUBLIC_DEV_TOOLS 时隐藏。
  const showSkip = !!onDevSkip && isDeveloperMode(__DEV__, process.env.EXPO_PUBLIC_DEV_TOOLS);

  const submit = async () => {
    if (busy) return;
    const c = code.trim();
    if (!c) {
      setErr("请输入激活码");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await onActivate(c);
    } catch (e) {
      setErr(activationErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.root}
    >
      <View style={styles.card}>
        <Text style={styles.title}>autotk 激活</Text>
        <Text style={styles.sub}>输入激活码以启用本设备</Text>

        {!configured && (
          <Text style={styles.warn}>
            ⚠️ 激活服务暂未就绪，请联系服务商开通后再激活。
          </Text>
        )}

        <TextInput
          style={styles.input}
          placeholder="XXXX-XXXX-XXXX-XXXX"
          placeholderTextColor="#7a7f8a"
          autoCapitalize="characters"
          autoCorrect={false}
          value={code}
          onChangeText={setCode}
          editable={!busy}
          onSubmitEditing={submit}
          returnKeyType="done"
        />

        {err ? <Text style={styles.err}>{err}</Text> : null}

        <TouchableOpacity
          style={[styles.btn, busy && styles.btnDisabled]}
          onPress={submit}
          disabled={busy}
          activeOpacity={0.8}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>激活</Text>}
        </TouchableOpacity>

        <Text style={styles.hint}>激活码由管理员在授权后台发放</Text>

        {showSkip && (
          <TouchableOpacity
            style={styles.skip}
            onPress={onDevSkip}
            activeOpacity={0.7}
          >
            <Text style={styles.skipText}>跳过激活（仅测试版）</Text>
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0f172a", justifyContent: "center", padding: 24 },
  card: { backgroundColor: "#1e293b", borderRadius: 16, padding: 24 },
  title: { color: "#fff", fontSize: 24, fontWeight: "700" },
  sub: { color: "#94a3b8", fontSize: 14, marginTop: 6, marginBottom: 20 },
  warn: { color: "#fbbf24", fontSize: 12, marginBottom: 12, lineHeight: 18 },
  input: {
    backgroundColor: "#0f172a",
    borderColor: "#334155",
    borderWidth: 1,
    borderRadius: 10,
    color: "#fff",
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    letterSpacing: 1,
  },
  err: { color: "#f87171", fontSize: 13, marginTop: 10 },
  btn: {
    backgroundColor: "#4f46e5",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 18,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  hint: { color: "#64748b", fontSize: 12, textAlign: "center", marginTop: 16 },
  skip: { marginTop: 14, alignItems: "center", paddingVertical: 6 },
  skipText: { color: "#64748b", fontSize: 12, textDecorationLine: "underline" },
});
