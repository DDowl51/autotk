import type { ReactNode } from "react";
import type { ModuleInteractionParams } from "../../params";
import { PercentField, Section, StepperField, SwitchField } from "../fields";

/**
 * 互动模块通用配置页，推荐页 / 搜索页 / 个人主页共用。
 * 通过 props 控制差异（是否含视频级动作、模块专属的头部/尾部控件）。
 */
export function ModuleTab({
  title,
  intro,
  value,
  onChange,
  showVideoActions = true,
  header,
  footer,
}: {
  title: string;
  intro: string;
  value: ModuleInteractionParams;
  onChange: (v: ModuleInteractionParams) => void;
  showVideoActions?: boolean;
  header?: ReactNode;
  footer?: ReactNode;
}) {
  const set = (patch: Partial<ModuleInteractionParams>) =>
    onChange({ ...value, ...patch });

  // 概率快捷预设：克制 / 自然 / 频繁，免去猜数字。
  const P = (a: number, b: number, c: number) => [
    { label: "克制", value: a },
    { label: "自然", value: b },
    { label: "频繁", value: c },
  ];

  return (
    <>
      <Section title={title} hint={intro}>
        {header}
        <SwitchField
          label="评论区互动"
          hint="开启后会进入评论区给评论点赞、回复"
          value={value.interactEnable}
          onChange={(v) => set({ interactEnable: v })}
        />
        <PercentField
          label="进评论区概率"
          hint="命中的视频里，有多少比例会进评论区互动"
          value={value.interactProb}
          onChange={(v) => set({ interactProb: v })}
          presets={P(0.3, 0.5, 0.8)}
        />
      </Section>

      {showVideoActions && (
        <Section title="视频动作" hint="对命中的视频本身做点赞 / 收藏 / 关注">
          <PercentField
            label="点赞概率"
            value={value.videoLikeProb}
            onChange={(v) => set({ videoLikeProb: v })}
            presets={P(0.2, 0.35, 0.6)}
          />
          <PercentField
            label="收藏概率"
            hint="收藏能强化兴趣标签，让算法更懂你的赛道"
            value={value.videoSaveProb}
            onChange={(v) => set({ videoSaveProb: v })}
            presets={P(0.05, 0.15, 0.3)}
          />
          <PercentField
            label="关注概率"
            hint="建议设低一些，过高不像真人"
            value={value.videoFollowProb}
            onChange={(v) => set({ videoFollowProb: v })}
            presets={P(0.05, 0.1, 0.2)}
          />
        </Section>
      )}

      <Section title="评论区动作" hint="进入评论区后的点赞与回复行为">
        <PercentField
          label="单条评论点赞概率"
          hint="页面有 10 条评论时，70% 约给 7 条点赞。别设到 100%，不像真人"
          value={value.commentLikeProb}
          onChange={(v) => set({ commentLikeProb: v })}
          presets={P(0.3, 0.5, 0.7)}
        />
        <StepperField
          label="评论点赞上限"
          hint="单个视频评论区最多给几条评论点赞"
          value={value.commentLikeMaxCount}
          onChange={(v) => set({ commentLikeMaxCount: v })}
          max={100}
        />
        <PercentField
          label="单条评论回复概率"
          hint="对每条评论按此概率回复（与点赞独立）。回复比点赞更易触发风控，建议设低"
          value={value.commentReplyProb}
          onChange={(v) => set({ commentReplyProb: v })}
          presets={P(0.1, 0.3, 0.5)}
        />
        <StepperField
          label="评论回复上限"
          hint="单个视频最多回复几条。回复太频繁易触发风控，建议 1~3"
          value={value.commentReplyMaxCount}
          onChange={(v) => set({ commentReplyMaxCount: v })}
          max={20}
        />
      </Section>

      {footer}
    </>
  );
}
