import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Button, Empty } from "antd";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import type { DeviceLogMsg } from "@mc/shared";
import type { StatusKind } from "./devices";
import { STATUS_LABEL } from "./devices";
import { C } from "./theme";
import { CountUp } from "./motion";

export function Mono({ children }: { children: ReactNode }) {
  return <span className="mono">{children}</span>;
}

const STATUS_TEXT: Record<StatusKind, string> = {
  alert: C.coral,
  stalled: C.amber,
  running: C.lime,
  online: C.cyan,
  offline: "#6b7787",
};

export function StatusDot({ kind }: { kind: StatusKind }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span className={`dot ${kind}`} />
      <span style={{ color: STATUS_TEXT[kind], fontSize: 13 }}>{STATUS_LABEL[kind]}</span>
    </span>
  );
}

export function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: string;
}) {
  return (
    <div className="tile" style={{ ["--accent" as string]: accent ?? "var(--lime)" }}>
      <div className="tile-value">
        {typeof value === "number" ? <CountUp value={value} /> : value}
      </div>
      <div className="tile-label">{label}</div>
    </div>
  );
}

/** 机群状态条：各段宽度按占比，GSAP 从左展开。 */
export function FleetBar({
  running,
  online,
  alerts,
  offline,
}: {
  running: number;
  online: number;
  alerts: number;
  offline: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const total = running + online + alerts + offline || 1;
  const seg = (n: number, color: string) =>
    n > 0 ? <span style={{ width: `${(n / total) * 100}%`, background: color }} /> : null;
  useGSAP(
    () => {
      const kids = ref.current ? Array.from(ref.current.children) : [];
      if (kids.length) gsap.fromTo(kids, { scaleX: 0 }, { scaleX: 1, duration: 0.7, ease: "power2.out", stagger: 0.08 });
    },
    { dependencies: [running, online, alerts, offline], scope: ref },
  );
  return (
    <div className="fleet-bar" ref={ref}>
      {seg(running, C.lime)}
      {seg(online, C.cyan)}
      {seg(alerts, C.coral)}
      {seg(offline, "#36425a")}
    </div>
  );
}

export function SectionCard({ title, extra, children }: { title?: ReactNode; extra?: ReactNode; children: ReactNode }) {
  return (
    <div className="card">
      {(title || extra) && (
        <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
          <div className="card-title" style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
            <span style={{ width: 3, height: 15, background: "var(--lime)", boxShadow: "0 0 10px var(--lime)" }} />
            {title}
          </div>
          <div style={{ marginLeft: "auto" }}>{extra}</div>
        </div>
      )}
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, extra }: { title: string; subtitle?: string; extra?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", marginBottom: 22 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 27, fontWeight: 800, letterSpacing: "-0.6px", color: "#f3f7ee" }}>{title}</h1>
        {subtitle && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
            <span className="mono" style={{ color: "var(--lime)", fontSize: 11 }}>—</span>
            <span style={{ color: C.dim, fontSize: 13 }}>{subtitle}</span>
          </div>
        )}
      </div>
      <div style={{ marginLeft: "auto" }}>{extra}</div>
    </div>
  );
}

export function EmptyHint({
  title,
  lines,
  actionText,
  onAction,
}: {
  title: string;
  lines: string[];
  actionText?: string;
  onAction?: () => void;
}) {
  return (
    <div style={{ textAlign: "center", padding: "48px 24px", color: C.dim }}>
      <div style={{ fontSize: 17, color: C.text, marginBottom: 12, fontWeight: 600 }}>{title}</div>
      {lines.map((l, i) => (
        <div key={i} style={{ fontSize: 13, lineHeight: 2 }}>
          {l}
        </div>
      ))}
      {actionText && onAction && (
        <Button type="primary" ghost style={{ marginTop: 16 }} onClick={onAction}>
          {actionText}
        </Button>
      )}
    </div>
  );
}

/** 路线图占位页（阶段 3 未实现的功能）。 */
export function RoadmapCard({ title, phase, points }: { title: string; phase: string; points: string[] }) {
  return (
    <SectionCard>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: C.text }}>{title}</span>
        <span
          className="mono"
          style={{ fontSize: 10.5, color: C.ink, background: C.lime, borderRadius: 6, padding: "2px 9px", fontWeight: 700, letterSpacing: 1 }}
        >
          {phase}
        </span>
      </div>
      <div style={{ color: C.dim, fontSize: 13, marginBottom: 14 }}>即将上线，规划中的能力：</div>
      <ul style={{ lineHeight: 2, paddingLeft: 18, margin: 0 }}>
        {points.map((p, i) => (
          <li key={i} style={{ color: "#a6b4c4" }}>
            {p}
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

const LOG_COLOR: Record<DeviceLogMsg["level"], string> = {
  info: "#a6b4c4",
  warn: C.amber,
  error: C.coral,
};

function hhmmss(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 设备实时日志面板：等级染色、时间戳、自动滚到底（可暂停）。 */
export function LogPanel({ lines }: { lines: DeviceLogMsg[] }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);

  useLayoutEffect(() => {
    if (paused) return;
    const el = boxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, paused]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const onScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
      setPaused(!atBottom);
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 8, gap: 8 }}>
        <span className="mono" style={{ color: C.faint, fontSize: 11.5, letterSpacing: 1 }}>
          实时日志 · {lines.length}
        </span>
        {paused && <span style={{ color: C.amber, fontSize: 12 }}>（已暂停，滚到底恢复）</span>}
        <Button
          size="small"
          style={{ marginLeft: "auto" }}
          onClick={() => {
            setPaused(false);
            const el = boxRef.current;
            if (el) el.scrollTop = el.scrollHeight;
          }}
        >
          回到底部
        </Button>
      </div>
      <div
        ref={boxRef}
        className="mono"
        style={{
          height: 320,
          overflowY: "auto",
          background: "#080a0e",
          border: `1px solid ${C.line}`,
          borderRadius: 0,
          padding: "10px 12px",
          fontSize: 12,
          lineHeight: 1.75,
        }}
      >
        {lines.length === 0 ? (
          <div style={{ color: C.faint, padding: "32px 0", textAlign: "center" }}>
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无日志（手机运行后会实时出现）" />
          </div>
        ) : (
          lines.map((l, i) => (
            <div key={i} style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              <span style={{ color: "#4d586a" }}>{hhmmss(l.ts)} </span>
              <span style={{ color: LOG_COLOR[l.level] }}>{l.msg}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
