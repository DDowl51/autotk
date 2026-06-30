import type { ReactNode } from "react";
import { Tag, Tooltip, Typography, Empty, Button, Space } from "antd";
import { QuestionCircleOutlined } from "@ant-design/icons";
import { codeStatusView, type CodeStatus } from "./status";

export type { CodeStatus };

/** 页头：标题 + 副标题 + 右侧操作。 */
export function PageHeader(props: { title: string; subtitle?: string; extra?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 20, gap: 16, flexWrap: "wrap" }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: -0.2 }}>{props.title}</h1>
        {props.subtitle && <div style={{ color: "#667085", marginTop: 4, fontSize: 13 }}>{props.subtitle}</div>}
      </div>
      {props.extra && <Space wrap>{props.extra}</Space>}
    </div>
  );
}

/** 激活码状态标签（含“已过期”判定）。逻辑在 codeStatusView（纯函数、可测）。 */
export function StatusTag({ status, expiresAt }: { status: CodeStatus; expiresAt?: string | null }) {
  const v = codeStatusView(status, expiresAt);
  return <Tag color={v.color}>{v.label}</Tag>;
}

/** 字段旁的小问号帮助提示。 */
export function HelpTip({ text }: { text: ReactNode }) {
  return (
    <Tooltip title={text}>
      <QuestionCircleOutlined style={{ color: "#98a2b3", marginLeft: 6 }} />
    </Tooltip>
  );
}

/** 空状态：插画 + 文案 + 引导按钮。 */
export function EmptyState(props: { title: string; description?: ReactNode; actionText?: string; onAction?: () => void }) {
  return (
    <div style={{ padding: "48px 0" }}>
      <Empty
        description={
          <div>
            <div style={{ fontWeight: 600, color: "#344054", marginBottom: 4 }}>{props.title}</div>
            {props.description && <div style={{ color: "#667085", fontSize: 13, maxWidth: 420, margin: "0 auto" }}>{props.description}</div>}
          </div>
        }
      >
        {props.actionText && props.onAction && (
          <Button type="primary" onClick={props.onAction}>
            {props.actionText}
          </Button>
        )}
      </Empty>
    </div>
  );
}

/** 等宽可复制文本（激活码 / key / secret）。 */
export function Mono({ children, copyable }: { children: string; copyable?: boolean }) {
  return (
    <Typography.Text className="mono" copyable={copyable ? { text: children } : false} style={{ fontSize: 13 }}>
      {children}
    </Typography.Text>
  );
}
