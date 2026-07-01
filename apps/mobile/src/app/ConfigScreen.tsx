import { useState } from "react";
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import type { AutomationParams } from "../params";
import { validateParams } from "../params";
import { status as wdaStatus } from "../wda";
import { useEngine } from "./useEngine";
import { COLORS, StepperField, SwitchField } from "./fields";
import { KeywordsTab } from "./tabs/KeywordsTab";
import { ModuleTab } from "./tabs/ModuleTab";
import { FollowingTab } from "./tabs/FollowingTab";
import { ScheduleTab } from "./tabs/ScheduleTab";
import { LogsTab } from "./tabs/LogsTab";
import { InspectorTab } from "./tabs/InspectorTab";
import { HubConnectScreen } from "./HubConnectScreen";
import { isDeveloperMode } from "./devtools";

type TabKey =
  | "kw"
  | "forYou"
  | "kwSearch"
  | "persHome"
  | "following"
  | "schedule"
  | "logs"
  | "debug";

const TABS: { key: TabKey; label: string }[] = [
  { key: "kw", label: "关键词" },
  { key: "forYou", label: "推荐页" },
  { key: "kwSearch", label: "搜索页" },
  { key: "persHome", label: "个人主页" },
  { key: "following", label: "关注监控" },
  { key: "schedule", label: "时间" },
  { key: "logs", label: "日志" },
  { key: "debug", label: "调试" },
];

export default function ConfigScreen({ initialParams }: { initialParams?: AutomationParams }) {
  const { params, setParams, running, mode, logs, stats, start, stop, hubConnected, hubUrl, setHubEndpoint } =
    useEngine(initialParams);
  const [tab, setTab] = useState<TabKey>("kw");
  const [wdaMsg, setWdaMsg] = useState("未测试");
  const [showHubConnect, setShowHubConnect] = useState(false);
  // 发行版隐藏「调试」Tab（非技术买家看不到）；dev 或 EXPO_PUBLIC_DEV_TOOLS=1 才显示。
  const showDev = isDeveloperMode(__DEV__, process.env.EXPO_PUBLIC_DEV_TOOLS);
  const visibleTabs = showDev ? TABS : TABS.filter((t) => t.key !== "debug");

  // 关键词三个字段用本地文本，保证输入流畅；存入 params 时按逗号/换行拆分。
  const [kwText, setKwText] = useState(params.searchKeywords.join(", "));
  const [posText, setPosText] = useState(params.posPrompts.join(", "));
  const [negText, setNegText] = useState(params.negPrompts.join(", "));
  // 固定回复一行一条（回复内容可能含逗号，故只按换行拆）。
  const [replyText, setReplyText] = useState(params.fixedReplies.join("\n"));
  const [matchText, setMatchText] = useState(params.commentMatchKeywords.join(", "));
  // 关注监控（打粉）覆盖用文本（留空则沿用全局）。
  const [fMatchText, setFMatchText] = useState((params.following.commentMatchKeywords ?? []).join(", "));
  const [fReplyText, setFReplyText] = useState((params.following.fixedReplies ?? []).join("\n"));
  const splitWords = (t: string) =>
    t.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
  const splitLines = (t: string) =>
    t.split(/\n+/).map((s) => s.trim()).filter(Boolean);

  const patch = (p: Partial<AutomationParams>) => setParams({ ...params, ...p });

  // 关键词/回复用本地文本编辑，需在离开输入前汇入 params（持久化才拿得到）。
  const buildTextMerged = (base: AutomationParams): AutomationParams => ({
    ...base,
    searchKeywords: splitWords(kwText),
    posPrompts: splitWords(posText),
    negPrompts: splitWords(negText),
    fixedReplies: splitLines(replyText),
    commentMatchKeywords: splitWords(matchText),
    following: {
      ...base.following,
      commentMatchKeywords: splitWords(fMatchText),
      fixedReplies: splitLines(fReplyText),
    },
  });
  // 切换标签时把所有文本框提交进 params（→ 触发持久化），不必等按「启动」。
  const switchTab = (k: TabKey) => {
    setParams(buildTextMerged(params));
    setTab(k);
  };

  const testWda = async () => {
    setWdaMsg("连接中…");
    try {
      const s = await wdaStatus();
      setWdaMsg(`已连接 · iOS ${s.os.version} · ready=${s.ready}`);
    } catch (e) {
      setWdaMsg(`连接失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const onStart = () => {
    const merged = buildTextMerged(params);
    const errors = validateParams(merged);
    if (errors.length > 0) {
      setWdaMsg("参数错误：" + errors[0]);
      setTab("logs");
      return;
    }
    setParams(merged);
    start();
  };

  if (showHubConnect) {
    return (
      <HubConnectScreen
        current={hubUrl}
        onConnect={setHubEndpoint}
        onClose={() => setShowHubConnect(false)}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />

      {/* 顶栏：标题 + 运行状态 + 启动/停止 */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.title}>TK 自动化运营助手</Text>
            <View style={styles.statusRow}>
              <View
                style={[styles.dot, running ? styles.dotOn : styles.dotOff]}
              />
              <Text style={styles.statusText}>
                {running ? "运行中" : "已停止"} · {mode === "real" ? "真机" : "演示"}
              </Text>
            </View>
            <TouchableOpacity style={styles.statusRow} onPress={() => setShowHubConnect(true)} activeOpacity={0.7}>
              <View style={[styles.dot, hubConnected ? styles.dotOn : styles.dotOff]} />
              <Text style={styles.statusText}>
                {hubConnected ? "已连接控制中心" : "未连接控制中心 · 点此连接"}
              </Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={[styles.runBtn, running ? styles.stopBtn : styles.startBtn]}
            onPress={running ? stop : onStart}
            activeOpacity={0.8}
          >
            <Text style={styles.runBtnText}>{running ? "停止" : "启动"}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.statsRow}>
          <Stat label="浏览" v={stats.videosWatched} />
          <Stat label="点赞" v={stats.likes} />
          <Stat label="收藏" v={stats.saves} />
          <Stat label="关注" v={stats.follows} />
          <Stat label="评论赞" v={stats.commentLikes} />
          <Stat label="回复" v={stats.commentReplies} />
        </View>
      </View>

      {/* 标签栏 */}
      <View style={styles.tabBarWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabBar}
        >
          {visibleTabs.map((t) => {
            const active = t.key === tab;
            return (
              <TouchableOpacity
                key={t.key}
                style={[styles.tab, active && styles.tabActive]}
                onPress={() => switchTab(t.key)}
                activeOpacity={0.7}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* 内容 */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {tab === "kw" && (
          <KeywordsTab
            kw={kwText}
            setKw={setKwText}
            pos={posText}
            setPos={setPosText}
            neg={negText}
            setNeg={setNegText}
            reply={replyText}
            setReply={setReplyText}
            match={matchText}
            setMatch={setMatchText}
          />
        )}

        {tab === "forYou" && (
          <ModuleTab
            title="推荐页互动"
            intro="养号主战场：模拟真人刷推荐流，命中正向提示词的视频才互动，巩固账号兴趣标签。"
            value={params.forYou}
            onChange={(v) => patch({ forYou: v })}
          />
        )}

        {tab === "kwSearch" && (
          <ModuleTab
            title="搜索页互动"
            intro="营销主阵地：按关键词搜索对标视频，对精准用户互动拉粉。占比由「时间」页调节。"
            value={params.kwSearch}
            onChange={(v) => patch({ kwSearch: v })}
          />
        )}

        {tab === "persHome" && (
          <ModuleTab
            title="个人主页互动"
            intro="对自己作品的评论区互动，激发用户二次回访。每天仅运行一次。账号没发过作品请关闭。"
            value={params.persHome}
            onChange={(v) => patch({ persHome: { ...params.persHome, ...v } })}
            showVideoActions={false}
            header={
              <SwitchField
                label="启用个人主页模块"
                hint="账号无任何作品时必须关闭"
                value={params.persHome.moduleEnable}
                onChange={(v) =>
                  patch({ persHome: { ...params.persHome, moduleEnable: v } })
                }
              />
            }
            footer={
              <View style={styles.footerCard}>
                <StepperField
                  label="互动作品数"
                  hint="进主页后对几条自己的作品互动，建议 ≤ 每天更新条数"
                  value={params.persHome.maxVideoCount}
                  onChange={(v) =>
                    patch({
                      persHome: { ...params.persHome, maxVideoCount: v },
                    })
                  }
                  max={50}
                />
              </View>
            }
          />
        )}

        {tab === "following" && (
          <FollowingTab
            params={params}
            patch={patch}
            match={fMatchText}
            setMatch={setFMatchText}
            reply={fReplyText}
            setReply={setFReplyText}
          />
        )}

        {tab === "schedule" && <ScheduleTab params={params} patch={patch} />}

        {tab === "logs" && (
          <LogsTab logs={logs} wdaMsg={wdaMsg} onTestWda={testWda} />
        )}

        {showDev && tab === "debug" && <InspectorTab />}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, v }: { label: string; v: number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statV}>{v}</Text>
      <Text style={styles.statL}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 14,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { color: COLORS.text, fontSize: 19, fontWeight: "800" },
  statusRow: { flexDirection: "row", alignItems: "center", marginTop: 5 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  dotOn: { backgroundColor: COLORS.green },
  dotOff: { backgroundColor: COLORS.faint },
  statusText: { color: COLORS.sub, fontSize: 12 },
  runBtn: {
    paddingHorizontal: 24,
    paddingVertical: 11,
    borderRadius: 12,
  },
  startBtn: { backgroundColor: COLORS.green },
  stopBtn: { backgroundColor: COLORS.accent },
  runBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 16,
  },
  stat: { alignItems: "center", flex: 1 },
  statV: { color: COLORS.text, fontSize: 17, fontWeight: "800" },
  statL: { color: COLORS.sub, fontSize: 11, marginTop: 3 },
  tabBarWrap: {
    backgroundColor: COLORS.bg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tabBar: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tabActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  tabText: { color: COLORS.sub, fontSize: 13, fontWeight: "600" },
  tabTextActive: { color: "#fff" },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 60 },
  footerCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
});
