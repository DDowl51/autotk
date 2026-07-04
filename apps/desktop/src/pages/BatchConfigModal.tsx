import { useState } from "react";
import { Modal, Tabs, Button, Alert, Switch, message } from "antd";
import type { ConfigPatch, ModuleParamsPatch, DeviceInfo } from "@mc/shared";
import { useHub } from "../hubState";
import { Section, SwitchRow, PercentRow, StepperRow, TextRow, TimeWindows, PHONE } from "../configForm";

const splitWords = (s: string) => s.split(/[,，\n]/).map((x) => x.trim()).filter(Boolean);
const splitLines = (s: string) => s.split(/\n+/).map((x) => x.trim()).filter(Boolean);

const MODULE_DEFAULT: Required<ModuleParamsPatch> = {
  interactEnable: true,
  interactProb: 0.5,
  videoLikeProb: 0.3,
  videoSaveProb: 0.1,
  videoFollowProb: 0.1,
  commentLikeProb: 0.5,
  commentReplyProb: 0.2,
  commentLikeMaxCount: 4,
  commentReplyMaxCount: 2,
};

type Mod = ModuleParamsPatch & { moduleEnable?: boolean; maxVideoCount?: number };

interface Draft {
  kwText: string;
  posText: string;
  negText: string;
  matchText: string;
  replyText: string;
  forYou: Required<ModuleParamsPatch>;
  kwSearch: Required<ModuleParamsPatch>;
  persHome: Mod;
  followingEnable: boolean;
  following: Required<ModuleParamsPatch>;
  followingMatchText: string;
  followingReplyText: string;
  kwSearchExecRatio: number;
  clickWaitTime: number;
  postReplies: boolean;
  allDay: boolean;
  taskWindows: Array<{ start: string; end: string }>;
}

const DEFAULT_DRAFT: Draft = {
  kwText: "",
  posText: "*",
  negText: "",
  matchText: "",
  replyText: "",
  forYou: { ...MODULE_DEFAULT },
  kwSearch: { ...MODULE_DEFAULT, interactProb: 0.45, videoLikeProb: 0.5, videoSaveProb: 0.3, videoFollowProb: 0.3, commentLikeProb: 0.5, commentReplyProb: 0.3, commentLikeMaxCount: 5 },
  persHome: { moduleEnable: false, interactEnable: false, interactProb: 0.1, commentLikeProb: 0.5, commentReplyProb: 0.5, commentLikeMaxCount: 4, commentReplyMaxCount: 2, maxVideoCount: 3 },
  followingEnable: false,
  following: { interactEnable: true, interactProb: 1, videoLikeProb: 0, videoSaveProb: 0, videoFollowProb: 0, commentLikeProb: 0.3, commentReplyProb: 0.8, commentLikeMaxCount: 3, commentReplyMaxCount: 3 },
  followingMatchText: "",
  followingReplyText: "",
  kwSearchExecRatio: 0.8,
  clickWaitTime: 1,
  postReplies: false,
  allDay: false,
  taskWindows: [{ start: "09:00:00", end: "12:00:00" }],
};

type GroupKey = "kw" | "forYou" | "kwSearch" | "persHome" | "following" | "schedule";

/** 分组开关：开了才会把这组下发。 */
function GroupGate({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      style={{
        marginBottom: 14,
        padding: "2px 14px",
        background: on ? "rgba(254,44,85,0.12)" : PHONE.cardAlt,
        border: `1px solid ${on ? PHONE.accent : PHONE.border}`,
        borderRadius: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "8px 0" }}>
        <div>
          <div style={{ color: PHONE.text, fontSize: 14, fontWeight: 600 }}>下发这组设置到所选手机</div>
          <div style={{ color: PHONE.faint, fontSize: 11, marginTop: 2 }}>关闭则本组保持手机上原样不动</div>
        </div>
        <Switch checked={on} onChange={onChange} style={on ? { background: PHONE.accent } : undefined} />
      </div>
    </div>
  );
}

function ModuleFields({
  value,
  onChange,
}: {
  value: Required<ModuleParamsPatch>;
  onChange: (v: Required<ModuleParamsPatch>) => void;
}) {
  const set = (p: Partial<ModuleParamsPatch>) => onChange({ ...value, ...p });
  return (
    <>
      <Section title="评论区互动" hint="开启后会进入评论区给评论点赞、回复">
        <SwitchRow label="评论区互动" value={value.interactEnable} onChange={(v) => set({ interactEnable: v })} />
        <PercentRow label="进评论区概率" hint="命中的视频里，多少比例会进评论区互动" value={value.interactProb} onChange={(v) => set({ interactProb: v })} />
      </Section>
      <Section title="视频动作" hint="对命中的视频本身做点赞 / 收藏 / 关注">
        <PercentRow label="点赞概率" value={value.videoLikeProb} onChange={(v) => set({ videoLikeProb: v })} />
        <PercentRow label="收藏概率" hint="收藏能强化兴趣标签" value={value.videoSaveProb} onChange={(v) => set({ videoSaveProb: v })} />
        <PercentRow label="关注概率" hint="建议设低一些，过高不像真人" value={value.videoFollowProb} onChange={(v) => set({ videoFollowProb: v })} />
      </Section>
      <Section title="评论区动作" hint="进入评论区后的点赞与回复行为">
        <PercentRow label="单条评论点赞概率" value={value.commentLikeProb} onChange={(v) => set({ commentLikeProb: v })} />
        <StepperRow label="评论点赞上限" hint="单个视频最多给几条评论点赞（上限 30，防封号）" value={value.commentLikeMaxCount} onChange={(v) => set({ commentLikeMaxCount: v })} max={30} />
        <PercentRow label="单条评论回复概率" hint="比点赞更易触发风控，建议设低" value={value.commentReplyProb} onChange={(v) => set({ commentReplyProb: v })} />
        <StepperRow label="评论回复上限" hint="建议 1~3（上限 10，防封号）" value={value.commentReplyMaxCount} onChange={(v) => set({ commentReplyMaxCount: v })} max={10} />
      </Section>
    </>
  );
}

export function BatchConfigModal({
  open,
  onClose,
  targets,
}: {
  open: boolean;
  onClose: () => void;
  targets: DeviceInfo[];
}) {
  const { pushConfig, connected } = useHub();
  const [groups, setGroups] = useState<Record<GroupKey, boolean>>({
    kw: false,
    forYou: false,
    kwSearch: false,
    persHome: false,
    following: false,
    schedule: false,
  });
  const [draft, setDraft] = useState<Draft>(DEFAULT_DRAFT);
  const gate = (k: GroupKey) => ({ on: groups[k], onChange: (v: boolean) => setGroups((g) => ({ ...g, [k]: v })) });
  const setD = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));

  function buildPatch(): ConfigPatch {
    const p: ConfigPatch = {};
    if (groups.kw) {
      p.searchKeywords = splitWords(draft.kwText);
      p.posPrompts = splitWords(draft.posText);
      p.negPrompts = splitWords(draft.negText);
      p.commentMatchKeywords = splitWords(draft.matchText);
      p.fixedReplies = splitLines(draft.replyText);
    }
    if (groups.forYou) p.forYou = draft.forYou;
    if (groups.kwSearch) p.kwSearch = draft.kwSearch;
    if (groups.persHome) p.persHome = draft.persHome;
    if (groups.following) {
      p.following = {
        moduleEnable: draft.followingEnable,
        ...draft.following,
        commentMatchKeywords: splitWords(draft.followingMatchText),
        fixedReplies: splitLines(draft.followingReplyText),
      };
    }
    if (groups.schedule) {
      p.kwSearchExecRatio = draft.kwSearchExecRatio;
      p.clickWaitTime = draft.clickWaitTime;
      p.postReplies = draft.postReplies;
      p.allDay = draft.allDay;
      p.taskWindows = draft.taskWindows;
    }
    return p;
  }

  function onSend() {
    const patch = buildPatch();
    if (Object.keys(patch).length === 0) {
      message.warning("请至少打开一个分组的「下发这组设置」开关");
      return;
    }
    pushConfig(
      targets.map((t) => ({ deviceId: t.deviceId, deviceName: t.deviceName })),
      patch,
    );
    message.success(`已下发到 ${targets.length} 台，进度见「下发记录」`);
    onClose(); // 下发后关闭弹窗（进度/历史去「下发记录」页看）
  }

  const tabItems = [
    {
      key: "kw",
      label: "关键词",
      children: (
        <>
          <GroupGate {...gate("kw")} />
          <Section title="搜索关键词" hint="搜索对标视频的词，逗号或换行分隔（不要带 # 号）">
            <TextRow label="关键词列表" value={draft.kwText} onChange={(v) => setD({ kwText: v })} placeholder="sexy, bikini, swimwear model" />
          </Section>
          <Section title="提示词" hint="正向=命中则看；反向=命中则划走">
            <TextRow label="正向词列表" value={draft.posText} onChange={(v) => setD({ posText: v })} placeholder="* 表示全部互动" />
            <TextRow label="反向词列表" value={draft.negText} onChange={(v) => setD({ negText: v })} placeholder="car, pet, food, kids" rows={2} />
          </Section>
          <Section title="评论与回复" hint="评论匹配词命中才回复其作者；固定回复一行一条">
            <TextRow label="评论匹配词" value={draft.matchText} onChange={(v) => setD({ matchText: v })} placeholder="where, link, how much" rows={2} />
            <TextRow label="固定回复列表（一行一条）" value={draft.replyText} onChange={(v) => setD({ replyText: v })} placeholder={"this is everything {emoji}\nfacts {emoji}"} />
          </Section>
        </>
      ),
    },
    {
      key: "forYou",
      label: "推荐页",
      children: (
        <>
          <GroupGate {...gate("forYou")} />
          <ModuleFields value={draft.forYou} onChange={(v) => setD({ forYou: v })} />
        </>
      ),
    },
    {
      key: "kwSearch",
      label: "搜索页",
      children: (
        <>
          <GroupGate {...gate("kwSearch")} />
          <ModuleFields value={draft.kwSearch} onChange={(v) => setD({ kwSearch: v })} />
        </>
      ),
    },
    {
      key: "persHome",
      label: "个人主页",
      children: (
        <>
          <GroupGate {...gate("persHome")} />
          <Section title="个人主页模块" hint="对自己作品评论区互动。账号没发过作品请关闭">
            <SwitchRow label="启用个人主页模块" hint="账号无任何作品时必须关闭" value={!!draft.persHome.moduleEnable} onChange={(v) => setD({ persHome: { ...draft.persHome, moduleEnable: v } })} />
            <PercentRow label="进评论区概率" value={draft.persHome.interactProb ?? 0.1} onChange={(v) => setD({ persHome: { ...draft.persHome, interactProb: v } })} />
            <StepperRow label="互动作品数" hint="进主页后对几条自己的作品互动" value={draft.persHome.maxVideoCount ?? 3} onChange={(v) => setD({ persHome: { ...draft.persHome, maxVideoCount: v } })} max={50} />
          </Section>
          <Section title="评论区动作">
            <PercentRow label="单条评论点赞概率" value={draft.persHome.commentLikeProb ?? 0.5} onChange={(v) => setD({ persHome: { ...draft.persHome, commentLikeProb: v } })} />
            <PercentRow label="单条评论回复概率" value={draft.persHome.commentReplyProb ?? 0.5} onChange={(v) => setD({ persHome: { ...draft.persHome, commentReplyProb: v } })} />
          </Section>
        </>
      ),
    },
    {
      key: "following",
      label: "关注监控",
      children: (
        <>
          <GroupGate {...gate("following")} />
          <Section
            title="关注监控（打粉）"
            hint="⚠️ 开启后进入纯打粉：只跑「关注」流回复引流、暂停日常养号（推荐/搜索/主页都不跑，与养号互斥）。先在各手机 TikTok 里关注一批目标账号。"
          >
            <SwitchRow
              label="启用关注监控（与养号互斥）"
              value={draft.followingEnable}
              onChange={(v) => setD({ followingEnable: v })}
            />
          </Section>
          <ModuleFields value={draft.following} onChange={(v) => setD({ following: v })} />
          <Section title="打粉关键词（可选）" hint="评论含这些词才回复其作者。留空 = 沿用「关键词」页的全局评论匹配词。">
            <TextRow
              label="打粉关键词"
              value={draft.followingMatchText}
              onChange={(v) => setD({ followingMatchText: v })}
              placeholder="how much, where to buy, dm me"
              rows={2}
            />
          </Section>
          <Section title="打粉话术（可选）" hint="引流话术，一行一条随机取。留空 = 沿用全局固定回复。占位符 {emoji}/{user}/{kw}。">
            <TextRow
              label="话术列表（一行一条）"
              value={draft.followingReplyText}
              onChange={(v) => setD({ followingReplyText: v })}
              placeholder={"感兴趣的宝子扣1 {emoji}\n主页有联系方式哦 {emoji}"}
            />
          </Section>
        </>
      ),
    },
    {
      key: "schedule",
      label: "时间",
      children: (
        <>
          <GroupGate {...gate("schedule")} />
          <Section title="运行节奏" hint="决定时间更多花在「搜索拉粉」还是「推荐页养号」上">
            <PercentRow label="搜索互动占比" hint="越高越偏营销拉粉；越低越偏养号" value={draft.kwSearchExecRatio} onChange={(v) => setD({ kwSearchExecRatio: v })} />
            <StepperRow label="点赞间隔" hint="每次点赞动作之间的停顿，太快不像真人（必须 >0）" value={draft.clickWaitTime} onChange={(v) => setD({ clickWaitTime: v })} step={0.5} min={0.5} max={10} suffix=" 秒" />
            <SwitchRow label="真实发送评论回复" hint="关闭时只预览不发送（先验证内容）；确认无误再打开真发" value={draft.postReplies} onChange={(v) => setD({ postReplies: v })} />
          </Section>
          <Section title="任务时间段" hint="在哪些时间段内运行（手机本地时间，HH:MM:SS）。各段不重叠、按先后排列">
            <SwitchRow label="全天运行" hint="开启后全天不间断；关闭则只在下方时间段内运行" value={draft.allDay} onChange={(v) => setD({ allDay: v })} />
            {!draft.allDay && <TimeWindows windows={draft.taskWindows} onChange={(w) => setD({ taskWindows: w })} />}
          </Section>
        </>
      ),
    },
  ];

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={760}
      title={`批量修改设置 · 已选 ${targets.length} 台`}
      footer={[
        <Button key="close" onClick={onClose}>
          取消
        </Button>,
        <Button key="send" type="primary" disabled={!connected} onClick={onSend}>
          下发到 {targets.length} 台
        </Button>,
      ]}
      styles={{ body: { maxHeight: "64vh", overflowY: "auto", background: PHONE.bg, padding: 16, borderRadius: 10 } }}
    >
      {!connected && <Alert type="warning" showIcon style={{ marginBottom: 12 }} message="未连接 Hub，无法下发" />}
      <Tabs items={tabItems} />
    </Modal>
  );
}
