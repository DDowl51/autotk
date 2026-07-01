import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity } from "react-native";
import { COLORS, Section } from "./fields";

const STEPS: { title: string; body: string }[] = [
  {
    title: "1. 激活",
    body: "首次打开，输入服务商发给你的激活码即可启用本机。",
  },
  {
    title: "2. 连接控制中心",
    body: "点顶部「未连接控制中心」，扫电脑上控制中心设置页里的二维码即可连上；同一 WiFi 下也会自动连上。不连也能单机运行。",
  },
  {
    title: "3. 填关键词与回复",
    body: "在「关键词」页填要搜索的词、想看/想划走的词、要回复的评论匹配词，以及固定回复（点占位符按钮即可插入，下面有实时预览）。",
  },
  {
    title: "4. 调互动力度",
    body: "在「推荐页 / 搜索页 / 关注监控」页，用「克制 / 自然 / 频繁」预设调各项概率——越自然越安全，别都拉满。",
  },
  {
    title: "5. 设运行时间",
    body: "在「时间」页选运行时间段（按本机时区显示），或直接开「全天运行」。",
  },
  {
    title: "6. 打粉引流（可选）",
    body: "先在 TikTok 里关注目标账号，再到「关注监控」页开启；命中关键词的评论会自动回复你的引流话术。",
  },
  {
    title: "7. 启动",
    body: "点右上角「启动」开始运行，「日志」页看实时动作。顶部若显示「演示模式」，说明还没接真机、数据是模拟的。",
  },
];

/** 使用说明 / 首次引导（首启弹一次，之后可从主界面「使用说明」再看）。 */
export function HelpScreen({ onDone }: { onDone: () => void }) {
  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>使用说明</Text>
        <Text style={styles.sub}>照下面几步走就行，不需要任何专业知识。</Text>
        {STEPS.map((s) => (
          <Section key={s.title} title={s.title}>
            <Text style={styles.body}>{s.body}</Text>
          </Section>
        ))}
        <TouchableOpacity style={styles.btn} onPress={onDone} activeOpacity={0.85}>
          <Text style={styles.btnText}>开始使用</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 20, paddingBottom: 40 },
  title: { color: COLORS.text, fontSize: 22, fontWeight: "800", marginTop: 8 },
  sub: { color: COLORS.sub, fontSize: 13, marginTop: 6, marginBottom: 16 },
  body: { color: COLORS.sub, fontSize: 13.5, lineHeight: 20, marginTop: 4 },
  btn: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 8,
  },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
