import { Component, type ReactNode } from "react";
import { track } from "./telemetry";

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
  msg?: string;
}

/** 顶层错误边界：任一页面渲染崩溃时显示人话提示 + 刷新，而不是整窗白屏。 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(e: Error): State {
    return { hasError: true, msg: e?.message };
  }

  componentDidCatch(e: Error): void {
    // eslint-disable-next-line no-console
    console.error("页面渲染出错：", e);
    try {
      track("render_error", { message: e?.message ?? "" });
    } catch {
      /* 埋点失败无所谓 */
    }
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{ padding: 48, textAlign: "center", color: "#c8d3de" }}>
        <h2 style={{ margin: 0 }}>页面出错了</h2>
        <p style={{ color: "#8595a4", marginTop: 10 }}>{this.state.msg || "发生未知错误"}</p>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: 20,
            padding: "8px 22px",
            borderRadius: 8,
            border: "none",
            background: "#4f46e5",
            color: "#fff",
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          刷新
        </button>
      </div>
    );
  }
}
