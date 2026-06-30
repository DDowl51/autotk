import { useEffect, useState, type ReactNode } from "react";
import { Switch, Input } from "antd";

// 复刻手机端「设置」界面的视觉与交互（autotk src/app/fields.tsx）：
// 深色卡片 + TikTok 红强调色 + 分区/标签/说明；数值用 −/+ 圆钮 + 可点输入的居中数字，概率下方带进度条。
export const PHONE = {
  bg: "#0d0e12",
  card: "#16181f",
  cardAlt: "#1d2029",
  border: "#272b36",
  text: "#f2f3f5",
  sub: "#9aa0ad",
  faint: "#6b7280",
  accent: "#fe2c55",
  green: "#2bd576",
};

/** 卡片分区（对应手机端 Section）。 */
export function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div
      style={{
        background: PHONE.card,
        border: `1px solid ${PHONE.border}`,
        borderRadius: 0,
        padding: 16,
        marginBottom: 14,
      }}
    >
      <div style={{ color: PHONE.text, fontSize: 15, fontWeight: 700 }}>{title}</div>
      {hint && <div style={{ color: PHONE.sub, fontSize: 12, marginTop: 6, marginBottom: 4, lineHeight: 1.6 }}>{hint}</div>}
      <div style={{ marginTop: 10 }}>{children}</div>
    </div>
  );
}

function Label({ label, hint }: { label: string; hint?: string }) {
  return (
    <div>
      <div style={{ color: PHONE.text, fontSize: 14, fontWeight: 500 }}>{label}</div>
      {hint && <div style={{ color: PHONE.faint, fontSize: 11, marginTop: 3, lineHeight: 1.45 }}>{hint}</div>}
    </div>
  );
}

const fieldStyle: React.CSSProperties = { marginBottom: 14 };
const rowStyle: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 };

/** 圆形 −/+ 按钮（对应手机端 RoundBtn）。 */
function RoundBtn({ text, onClick }: { text: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: 32,
        height: 32,
        borderRadius: 16,
        background: PHONE.cardAlt,
        border: `1px solid ${PHONE.border}`,
        color: PHONE.text,
        fontSize: 18,
        lineHeight: "1",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
      }}
    >
      {text}
    </button>
  );
}

/** 可点击直接输入的居中数字（对应手机端 EditableValue）。失焦提交并归一化。 */
function EditableNum({
  value,
  format,
  parse,
  onCommit,
  unit,
}: {
  value: number;
  format: (v: number) => string;
  parse: (t: string) => number;
  onCommit: (v: number) => void;
  unit?: string;
}) {
  const [text, setText] = useState(() => format(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(format(value));
  }, [value, editing, format]);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 54, margin: "0 2px" }}>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={() => setEditing(true)}
        onBlur={() => {
          setEditing(false);
          const v = parse(text);
          onCommit(v);
          setText(format(v));
        }}
        style={{
          width: 36,
          background: "transparent",
          border: "none",
          outline: "none",
          color: PHONE.text,
          fontSize: 15,
          fontWeight: 700,
          textAlign: "center",
        }}
      />
      {unit && <span style={{ color: PHONE.sub, fontSize: 12, marginLeft: 1 }}>{unit}</span>}
    </span>
  );
}

function Stepper({
  value,
  step,
  clamp,
  format,
  parse,
  onChange,
  unit,
}: {
  value: number;
  step: number;
  clamp: (v: number) => number;
  format: (v: number) => string;
  parse: (t: string) => number;
  onChange: (v: number) => void;
  unit?: string;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center" }}>
      <RoundBtn text="−" onClick={() => onChange(clamp(value - step))} />
      <EditableNum value={value} format={format} parse={parse} onCommit={onChange} unit={unit} />
      <RoundBtn text="+" onClick={() => onChange(clamp(value + step))} />
    </span>
  );
}

/** 开关（对应手机端 SwitchField）。 */
export function SwitchRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div style={{ ...fieldStyle, ...rowStyle }}>
      <div style={{ flex: 1 }}>
        <Label label={label} hint={hint} />
      </div>
      <Switch checked={value} onChange={onChange} style={value ? { background: PHONE.accent } : undefined} />
    </div>
  );
}

/** 概率字段（对应手机端 PercentField）：−/+ 调节 + 可输入 + 下方进度条。value/onChange 为 0~1。 */
export function PercentRow({
  label,
  hint,
  value,
  onChange,
  step = 0.05,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  const clamp = (v: number) => Math.min(1, Math.max(0, Math.round(v * 100) / 100));
  const pct = Math.round(value * 100);
  return (
    <div style={fieldStyle}>
      <div style={rowStyle}>
        <div style={{ flex: 1 }}>
          <Label label={label} hint={hint} />
        </div>
        <Stepper
          value={value}
          step={step}
          clamp={clamp}
          format={(v) => String(Math.round(v * 100))}
          parse={(t) => clamp((parseFloat(t) || 0) / 100)}
          onChange={onChange}
          unit="%"
        />
      </div>
      <div style={{ height: 5, borderRadius: 3, background: PHONE.cardAlt, marginTop: 10, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: PHONE.accent }} />
      </div>
    </div>
  );
}

/** 整数/数值步进字段（对应手机端 StepperField）。 */
export function StepperRow({
  label,
  hint,
  value,
  onChange,
  step = 1,
  min = 0,
  max = 999,
  suffix,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v * 100) / 100));
  return (
    <div style={{ ...fieldStyle, ...rowStyle }}>
      <div style={{ flex: 1 }}>
        <Label label={label} hint={hint} />
      </div>
      <Stepper
        value={value}
        step={step}
        clamp={clamp}
        format={(v) => String(v)}
        parse={(t) => clamp(parseFloat(t) || 0)}
        onChange={onChange}
        unit={suffix}
      />
    </div>
  );
}

/** 多行文本（对应手机端 TextField multiline）。 */
export function TextRow({
  label,
  hint,
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div style={{ ...fieldStyle, paddingTop: 2 }}>
      <Label label={label} hint={hint} />
      <Input.TextArea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ marginTop: 8, background: PHONE.bg, borderColor: PHONE.border, color: PHONE.text }}
      />
    </div>
  );
}

/** 时间段编辑（对应手机端 ScheduleTab 的 windowRow）。 */
export function TimeWindows({
  windows,
  onChange,
}: {
  windows: Array<{ start: string; end: string }>;
  onChange: (w: Array<{ start: string; end: string }>) => void;
}) {
  const setW = (i: number, field: "start" | "end", v: string) =>
    onChange(windows.map((w, j) => (j === i ? { ...w, [field]: v } : w)));
  const timeInput: React.CSSProperties = {
    flex: 1,
    background: PHONE.bg,
    border: `1px solid ${PHONE.border}`,
    borderRadius: 10,
    color: PHONE.text,
    fontSize: 15,
    fontWeight: 600,
    letterSpacing: 1,
    textAlign: "center",
    padding: "9px 8px",
    outline: "none",
  };
  return (
    <>
      {windows.map((w, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              background: PHONE.cardAlt,
              border: `1px solid ${PHONE.border}`,
              color: PHONE.sub,
              fontSize: 12,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {i + 1}
          </span>
          <input value={w.start} onChange={(e) => setW(i, "start", e.target.value)} style={timeInput} />
          <span style={{ color: PHONE.faint }}>→</span>
          <input value={w.end} onChange={(e) => setW(i, "end", e.target.value)} style={timeInput} />
          <button
            type="button"
            onClick={() => windows.length > 1 && onChange(windows.filter((_, j) => j !== i))}
            disabled={windows.length <= 1}
            style={{
              width: 30,
              height: 30,
              background: "transparent",
              border: "none",
              color: windows.length <= 1 ? PHONE.border : PHONE.accent,
              fontSize: 22,
              cursor: windows.length <= 1 ? "default" : "pointer",
            }}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => {
          const last = windows[windows.length - 1];
          onChange([...windows, { start: last ? last.end : "00:00:00", end: "23:59:00" }]);
        }}
        style={{
          width: "100%",
          marginTop: 4,
          padding: "9px 0",
          borderRadius: 10,
          border: `1px dashed ${PHONE.border}`,
          background: "transparent",
          color: PHONE.sub,
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        + 添加时间段
      </button>
    </>
  );
}
