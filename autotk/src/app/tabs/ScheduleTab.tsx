import { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { AutomationParams, TaskWindow } from "../../params";
import { COLORS, PercentField, Section, StepperField, SwitchField } from "../fields";
import { TimePickerModal } from "../TimePicker";

/** 全局节奏与分时段调度配置页。 */
export function ScheduleTab({
  params,
  patch,
}: {
  params: AutomationParams;
  patch: (p: Partial<AutomationParams>) => void;
}) {
  // 正在编辑哪一段的哪个端点（null 表示未打开选择器）。
  const [editing, setEditing] = useState<{ i: number; field: "start" | "end" } | null>(
    null,
  );

  const setWindow = (i: number, field: "start" | "end", v: string) => {
    const next = [...params.taskWindows];
    next[i] = { ...next[i], [field]: v };
    patch({ taskWindows: next });
  };

  const addWindow = () => {
    const last = params.taskWindows[params.taskWindows.length - 1];
    const start = last ? last.end : "00:00:00";
    const next: TaskWindow = { start, end: "23:59:00" };
    patch({ taskWindows: [...params.taskWindows, next] });
  };

  const removeWindow = (i: number) => {
    patch({ taskWindows: params.taskWindows.filter((_, idx) => idx !== i) });
  };

  const current = editing ? params.taskWindows[editing.i] : null;

  return (
    <>
      <Section
        title="运行节奏"
        hint="决定时间更多花在「搜索拉粉」还是「推荐页养号」上。"
      >
        <PercentField
          label="搜索互动占比"
          hint="越高越偏营销拉粉；越低越偏养号。养号期建议低，营销期可调高"
          value={params.kwSearchExecRatio}
          onChange={(v) => patch({ kwSearchExecRatio: v })}
        />
        <StepperField
          label="点赞间隔"
          hint="每次点赞动作之间的停顿，太快不像真人"
          value={params.clickWaitTime}
          onChange={(v) => patch({ clickWaitTime: v })}
          step={0.5}
          min={0}
          max={10}
          suffix=" 秒"
        />
        <SwitchField
          label="真实发送评论回复"
          hint="关闭时只在日志里预览回复、不发送（先验证内容）；确认无误再打开真发"
          value={params.postReplies ?? false}
          onChange={(v) => patch({ postReplies: v })}
        />
      </Section>

      <Section
        title="任务时间段"
        hint="设置在哪些时间段内运行（手机本地时间）。各段不能重叠，按时间先后排列。点击时间可滑动设置。"
      >
        <SwitchField
          label="全天运行"
          hint="开启后全天不间断运行；关闭则只在下方设置的时间段内运行"
          value={params.allDay ?? false}
          onChange={(v) => patch({ allDay: v })}
        />

        {!(params.allDay ?? false) && (
          <>
            {params.taskWindows.map((w, i) => (
              <View key={i} style={styles.windowRow}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{i + 1}</Text>
                </View>

                <TouchableOpacity
                  style={styles.timeBtn}
                  onPress={() => setEditing({ i, field: "start" })}
                >
                  <Text style={styles.timeText}>{w.start}</Text>
                </TouchableOpacity>

                <Text style={styles.dash}>→</Text>

                <TouchableOpacity
                  style={styles.timeBtn}
                  onPress={() => setEditing({ i, field: "end" })}
                >
                  <Text style={styles.timeText}>{w.end}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.removeBtn}
                  onPress={() => removeWindow(i)}
                  disabled={params.taskWindows.length <= 1}
                >
                  <Text
                    style={[
                      styles.removeText,
                      params.taskWindows.length <= 1 && styles.removeDisabled,
                    ]}
                  >
                    ×
                  </Text>
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity style={styles.addBtn} onPress={addWindow}>
              <Text style={styles.addText}>+ 添加时间段</Text>
            </TouchableOpacity>
          </>
        )}
      </Section>

      <TimePickerModal
        visible={editing !== null}
        value={current ? current[editing!.field] : "00:00:00"}
        title={
          editing
            ? `第 ${editing.i + 1} 段 · ${editing.field === "start" ? "开始" : "结束"}时间`
            : ""
        }
        onCancel={() => setEditing(null)}
        onConfirm={(v) => {
          if (editing) setWindow(editing.i, editing.field, v);
          setEditing(null);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  windowRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  badge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.cardAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  badgeText: { color: COLORS.sub, fontSize: 12, fontWeight: "700" },
  timeBtn: {
    flex: 1,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
  },
  timeText: { color: COLORS.text, fontSize: 16, fontWeight: "600", letterSpacing: 1 },
  dash: { color: COLORS.faint, marginHorizontal: 8, fontSize: 14 },
  removeBtn: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 6,
  },
  removeText: { color: COLORS.accent, fontSize: 24, fontWeight: "300", lineHeight: 26 },
  removeDisabled: { color: COLORS.border },
  addBtn: {
    marginTop: 4,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: "dashed",
    alignItems: "center",
  },
  addText: { color: COLORS.sub, fontSize: 14, fontWeight: "600" },
});
