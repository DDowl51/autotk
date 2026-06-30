import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COLORS, Section } from "../fields";

/** 运行日志页，实时显示引擎每一步动作。 */
export function LogsTab({
  logs,
  wdaMsg,
  onTestWda,
}: {
  logs: string[];
  wdaMsg: string;
  onTestWda: () => void;
}) {
  return (
    <>
      <Section
        title="WDA 连接"
        hint="测试与被控手机上 WDA 框架（localhost:8100）的连接。演示模式下不影响运行。"
      >
        <TouchableOpacity style={styles.testBtn} onPress={onTestWda}>
          <Text style={styles.testBtnText}>测试连接</Text>
        </TouchableOpacity>
        <Text style={styles.wdaMsg}>{wdaMsg}</Text>
      </Section>

      <Section title="运行日志" hint="启动后实时滚动，最新在最上面。">
        {logs.length === 0 ? (
          <Text style={styles.empty}>点击右上角「启动」后显示实时日志…</Text>
        ) : (
          <View>
            {logs
              .slice()
              .reverse()
              .map((l, i) => (
                <Text key={i} style={styles.line}>
                  {l}
                </Text>
              ))}
          </View>
        )}
      </Section>
    </>
  );
}

const styles = StyleSheet.create({
  testBtn: {
    backgroundColor: COLORS.cardAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  testBtnText: { color: COLORS.text, fontWeight: "600", fontSize: 14 },
  wdaMsg: { color: COLORS.sub, fontSize: 12, marginTop: 10 },
  empty: { color: COLORS.faint, fontSize: 13, fontStyle: "italic" },
  line: {
    color: COLORS.text,
    fontSize: 12,
    fontFamily: "monospace",
    lineHeight: 18,
  },
});
