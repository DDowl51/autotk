import { useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  createSession,
  go_home,
  source,
  status,
  TIKTOK_BUNDLE_ID,
} from "../../wda";
import { createRealUI } from "../realUI";
import type { TikTokUI } from "../../engine/tiktok-ui";
import { COLORS, Section } from "../fields";

/**
 * 真机调试页：用于机型适配。
 * 启动 TikTok、抓取当前界面的元素树（accessibility tree），
 * 复制后发回给开发，用来确定各按钮的定位选择器。
 */
export function InspectorTab() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [tree, setTree] = useState("");

  // 执行一个动作。不强行覆盖成「完成」——动作内部会自行 log 真实结果，
  // 只有出错时才显示失败信息。
  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    setMsg(`${label}…`);
    try {
      await fn();
    } catch (e) {
      setMsg(`${label} 失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const grab = async () => {
    setBusy(true);
    setMsg("抓取界面元素…");
    try {
      const xml = await source();
      setTree(xml);
      setMsg(`抓取完成，共 ${xml.length} 字符。长按下方文本可全选复制。`);
    } catch (e) {
      setMsg(`抓取失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  // 真机版 UI（onDeviceUI：标定坐标 + 图像检测），与正式运行同一路径。
  // 元素树版 wdaUI 因 snapshotMaxDepth=1 在真机 TikTok 不可用，故不再用于单步测试。
  const ui = useMemo<TikTokUI | null>(() => {
    try {
      return createRealUI((m) => setMsg(m));
    } catch {
      return null;
    }
  }, []);

  // 单步动作：真机 UI 不可用时提示而非崩溃。
  const act = (label: string, fn: (u: TikTokUI) => Promise<unknown>) => {
    const u = ui;
    if (!u) {
      setMsg("真机 UI 不可用（需 dev build + 标定坐标）");
      return;
    }
    void run(label, () => fn(u));
  };

  return (
    <>
      <Section
        title="真机调试"
        hint="机型适配用。先启动 TikTok，手动导航到目标界面（推荐页 / 评论区 / 搜索页 / 个人主页），再点「抓取界面元素」，把元素树复制发回开发。"
      >
        <View style={styles.btnRow}>
          <DebugBtn
            label="检测 WDA"
            disabled={busy}
            onPress={() =>
              run("检测 WDA", async () => {
                const s = await status();
                setMsg(`WDA 就绪：iOS ${s.os.version}`);
              })
            }
          />
          <DebugBtn
            label="启动 TikTok"
            disabled={busy}
            onPress={() =>
              run("启动 TikTok", async () => {
                await createSession(TIKTOK_BUNDLE_ID);
                setMsg("已启动 TikTok 会话");
              })
            }
          />
        </View>
        <View style={styles.btnRow}>
          <DebugBtn
            label="回主屏"
            disabled={busy}
            onPress={() =>
              run("回主屏", async () => {
                await go_home();
                setMsg("已回到主屏");
              })
            }
          />
          <DebugBtn label="抓取界面元素" primary disabled={busy} onPress={grab} />
        </View>
        {msg ? <Text style={styles.msg}>{msg}</Text> : null}
      </Section>

      <Section
        title="单步动作测试（推荐页）"
        hint="在 TikTok 推荐页停在某视频，逐个测试真机动作是否生效。每次只做一个动作。"
      >
        <View style={styles.btnRow}>
          <DebugBtn label="打开推荐页" disabled={busy} onPress={() => act("打开推荐页", (u) => u.openForYou())} />
          <DebugBtn label="读取文案" disabled={busy} onPress={() => act("读取文案", (u) => u.readCurrentVideo())} />
        </View>
        <View style={styles.btnRow}>
          <DebugBtn label="点赞" disabled={busy} onPress={() => act("点赞", (u) => u.likeVideo())} />
          <DebugBtn label="收藏" disabled={busy} onPress={() => act("收藏", (u) => u.saveVideo())} />
          <DebugBtn label="关注" disabled={busy} onPress={() => act("关注", (u) => u.followAuthor())} />
        </View>
        <View style={styles.btnRow}>
          <DebugBtn label="打开评论" disabled={busy} onPress={() => act("打开评论", (u) => u.openComments())} />
          <DebugBtn label="上滑下一个" primary disabled={busy} onPress={() => act("上滑下一个", (u) => u.swipeToNextVideo())} />
        </View>
      </Section>

      {tree ? (
        <Section title="界面元素树" hint="长按 → 全选 → 复制，发回开发。">
          <ScrollView style={styles.treeBox} nestedScrollEnabled>
            <TextInput
              style={styles.tree}
              value={tree}
              multiline
              editable={false}
              selectTextOnFocus
              scrollEnabled={false}
            />
          </ScrollView>
        </Section>
      ) : null}
    </>
  );
}

function DebugBtn({
  label,
  onPress,
  disabled,
  primary,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.btn, primary && styles.btnPrimary, disabled && styles.btnDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <Text style={[styles.btnText, primary && styles.btnTextPrimary]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btnRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  btn: {
    flex: 1,
    backgroundColor: COLORS.cardAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  btnPrimary: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: COLORS.text, fontSize: 14, fontWeight: "600" },
  btnTextPrimary: { color: "#fff" },
  msg: { color: COLORS.sub, fontSize: 12, marginTop: 4 },
  treeBox: { maxHeight: 360, backgroundColor: COLORS.bg, borderRadius: 8 },
  tree: {
    color: COLORS.text,
    fontSize: 11,
    fontFamily: "monospace",
    padding: 10,
  },
});
