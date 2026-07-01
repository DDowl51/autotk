import type { AutomationParams } from "../../params";
import { Section, SwitchField, TextField } from "../fields";
import { ModuleTab } from "./ModuleTab";

/**
 * 关注监控（打粉）配置页。
 * 复用 ModuleTab 调互动参数；额外提供「打粉专用关键词/话术」覆盖（留空则沿用全局）。
 * 覆盖用的两段文本由父级（ConfigScreen）提升管理，随参数一起持久化。
 */
export function FollowingTab({
  params,
  patch,
  match,
  setMatch,
  reply,
  setReply,
}: {
  params: AutomationParams;
  patch: (p: Partial<AutomationParams>) => void;
  match: string;
  setMatch: (v: string) => void;
  reply: string;
  setReply: (v: string) => void;
}) {
  const f = params.following;

  return (
    <>
      <Section
        title="关注监控（打粉）"
        hint="监控「关注」流里你关注账号发的视频，进评论区、对命中关键词的评论回复引流话术。开启后与养号轮流跑。"
      >
        <SwitchField
          label="启用关注监控"
          hint="先在 TikTok 里关注一批目标账号，再开这里"
          value={f.moduleEnable}
          onChange={(v) => patch({ following: { ...f, moduleEnable: v } })}
        />
      </Section>

      <ModuleTab
        title="打粉互动"
        intro="逐条查看关注账号的新视频，进评论区回复命中关键词的评论。视频点赞/收藏/关注默认关（打粉聚焦评论）。"
        value={f}
        onChange={(v) => patch({ following: { ...f, ...v } })}
      />

      <Section
        title="打粉关键词（可选）"
        hint="评论含这些词才回复其作者。留空 = 沿用「关键词」页的全局评论匹配词。逗号或换行分隔。"
      >
        <TextField
          label="打粉关键词列表"
          value={match}
          onChange={setMatch}
          multiline
          placeholder="how much, where to buy, link, dm me"
        />
      </Section>

      <Section
        title="打粉回复话术（可选）"
        hint="引流话术，随机取一条（一行一条）。留空 = 沿用「关键词」页的全局固定回复。占位符同全局：{emoji}/{a|b|c}/{user}/{kw}。"
      >
        <TextField
          label="话术列表（一行一条）"
          value={reply}
          onChange={setReply}
          multiline
          placeholder={"感兴趣的宝子扣1，我发你 {emoji}\n主页有联系方式哦 {emoji}"}
        />
      </Section>
    </>
  );
}
