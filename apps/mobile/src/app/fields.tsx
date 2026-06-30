import { useEffect, useState, type ReactNode } from "react";
import {
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

export const COLORS = {
  bg: "#0d0e12",
  card: "#16181f",
  cardAlt: "#1d2029",
  border: "#272b36",
  text: "#f2f3f5",
  sub: "#9aa0ad",
  faint: "#6b7280",
  accent: "#fe2c55",
  cyan: "#25f4ee",
  green: "#2bd576",
};

/** 卡片分区，可带说明文字。 */
export function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
      {children}
    </View>
  );
}

function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  hint?: string;
}) {
  return (
    <View style={styles.field}>
      <FieldLabel label={label} hint={hint} />
      <TextInput
        style={[styles.input, multiline && styles.multiline]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={COLORS.faint}
        multiline={multiline}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}

export function SwitchField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <View style={[styles.field, styles.row]}>
      <View style={styles.rowLabel}>
        <FieldLabel label={label} hint={hint} />
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: COLORS.accent, false: COLORS.border }}
        thumbColor="#fff"
      />
    </View>
  );
}

function RoundBtn({ text, onPress }: { text: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.roundBtn} onPress={onPress} activeOpacity={0.6}>
      <Text style={styles.roundBtnText}>{text}</Text>
    </TouchableOpacity>
  );
}

/**
 * 可直接点击输入的数值显示。
 * 平时显示格式化后的值；点击聚焦后可手动输入，失焦时提交并按规则归一化。
 * +/- 按钮改变 value 时（未聚焦），文本自动同步。
 */
function EditableValue({
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
    <View style={styles.valueBox}>
      <TextInput
        style={styles.valueInput}
        value={text}
        onChangeText={setText}
        onFocus={() => setEditing(true)}
        onBlur={() => {
          setEditing(false);
          const v = parse(text);
          onCommit(v);
          setText(format(v));
        }}
        keyboardType="decimal-pad"
        returnKeyType="done"
        selectTextOnFocus
      />
      {unit ? <Text style={styles.unit}>{unit}</Text> : null}
    </View>
  );
}

/** 概率字段：百分比展示，可点数字直接输入，也可用 −/+ 调节，下方有进度条。value/onChange 为 0~1。 */
export function PercentField({
  label,
  value,
  onChange,
  hint,
  step = 0.05,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  hint?: string;
  step?: number;
}) {
  const clamp = (v: number) => Math.min(1, Math.max(0, Math.round(v * 100) / 100));
  const pct = Math.round(value * 100);
  return (
    <View style={styles.field}>
      <View style={styles.row}>
        <View style={styles.rowLabel}>
          <FieldLabel label={label} hint={hint} />
        </View>
        <View style={styles.stepper}>
          <RoundBtn text="−" onPress={() => onChange(clamp(value - step))} />
          <EditableValue
            value={value}
            format={(v) => String(Math.round(v * 100))}
            parse={(t) => {
              const n = parseFloat(t);
              return clamp((Number.isFinite(n) ? n : 0) / 100);
            }}
            onCommit={onChange}
            unit="%"
          />
          <RoundBtn text="+" onPress={() => onChange(clamp(value + step))} />
        </View>
      </View>
      <View style={styles.track}>
        <View style={[styles.trackFill, { width: `${pct}%` }]} />
      </View>
    </View>
  );
}

/** 整数/数值步进字段。可点数字直接输入，也可用 −/+ 调节。 */
export function StepperField({
  label,
  value,
  onChange,
  hint,
  step = 1,
  min = 0,
  max = 999,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  hint?: string;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  const clamp = (v: number) =>
    Math.min(max, Math.max(min, Math.round(v * 100) / 100));
  return (
    <View style={[styles.field, styles.row]}>
      <View style={styles.rowLabel}>
        <FieldLabel label={label} hint={hint} />
      </View>
      <View style={styles.stepper}>
        <RoundBtn text="−" onPress={() => onChange(clamp(value - step))} />
        <EditableValue
          value={value}
          format={(v) => String(v)}
          parse={(t) => {
            const n = parseFloat(t);
            return clamp(Number.isFinite(n) ? n : 0);
          }}
          onCommit={onChange}
          unit={suffix}
        />
        <RoundBtn text="+" onPress={() => onChange(clamp(value + step))} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sectionTitle: { color: COLORS.text, fontSize: 15, fontWeight: "700" },
  sectionHint: {
    color: COLORS.sub,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
    marginBottom: 12,
  },
  field: { marginBottom: 14 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowLabel: { flex: 1, marginRight: 12 },
  label: { color: COLORS.text, fontSize: 14, fontWeight: "500" },
  hint: { color: COLORS.faint, fontSize: 11, lineHeight: 15, marginTop: 3 },
  input: {
    backgroundColor: COLORS.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginTop: 8,
  },
  multiline: { minHeight: 76, textAlignVertical: "top" },
  stepper: { flexDirection: "row", alignItems: "center" },
  roundBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.cardAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  roundBtnText: { color: COLORS.text, fontSize: 20, fontWeight: "600", lineHeight: 22 },
  valueBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 56,
    marginHorizontal: 2,
  },
  valueInput: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
    paddingVertical: 4,
    paddingHorizontal: 2,
    minWidth: 30,
  },
  unit: { color: COLORS.sub, fontSize: 12, marginLeft: 1 },
  track: {
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.cardAlt,
    marginTop: 10,
    overflow: "hidden",
  },
  trackFill: { height: 5, borderRadius: 3, backgroundColor: COLORS.accent },
});
