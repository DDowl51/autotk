import { Component, type ReactNode } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COLORS } from "./fields";

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
  msg?: string;
}

/** 顶层错误边界：任何界面渲染崩溃时显示人话提示 + 重试，而不是白屏。 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(e: Error): State {
    return { hasError: true, msg: e?.message };
  }

  componentDidCatch(e: Error): void {
    // eslint-disable-next-line no-console
    console.error("界面渲染出错：", e);
  }

  private reset = () => this.setState({ hasError: false, msg: undefined });

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    return (
      <View style={styles.root}>
        <Text style={styles.title}>应用出错了</Text>
        <Text style={styles.msg}>{this.state.msg || "发生未知错误"}</Text>
        <TouchableOpacity style={styles.btn} onPress={this.reset} activeOpacity={0.85}>
          <Text style={styles.btnText}>重试</Text>
        </TouchableOpacity>
        <Text style={styles.hint}>若反复出错，请重启 App</Text>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg, alignItems: "center", justifyContent: "center", padding: 28 },
  title: { color: COLORS.text, fontSize: 20, fontWeight: "800" },
  msg: { color: COLORS.sub, fontSize: 13, marginTop: 10, textAlign: "center", lineHeight: 19 },
  btn: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 40,
    marginTop: 22,
  },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  hint: { color: COLORS.faint, fontSize: 12, marginTop: 14 },
});
