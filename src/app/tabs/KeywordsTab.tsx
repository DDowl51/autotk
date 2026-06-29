import { Section, TextField } from "../fields";

/**
 * 关键词与提示词配置页。
 * 这些词决定了「搜什么、看什么、划走什么」，是整套自动化的方向盘。
 */
export function KeywordsTab({
  kw,
  setKw,
  pos,
  setPos,
  neg,
  setNeg,
  reply,
  setReply,
  match,
  setMatch,
}: {
  kw: string;
  setKw: (v: string) => void;
  pos: string;
  setPos: (v: string) => void;
  neg: string;
  setNeg: (v: string) => void;
  reply: string;
  setReply: (v: string) => void;
  match: string;
  setMatch: (v: string) => void;
}) {
  return (
    <>
      <Section
        title="搜索关键词"
        hint="用来搜索对标视频的词，建议 30~500 个。可以是对标博主、视频文案或标签（不要带 # 号）。逗号或换行分隔。"
      >
        <TextField
          label="关键词列表"
          value={kw}
          onChange={setKw}
          multiline
          placeholder="sexy, bikini, swimwear model, beach"
        />
      </Section>

      <Section
        title="正向提示词"
        hint="刷推荐页时，视频文案/标签命中这些词，就当作感兴趣的视频去观看互动。可与搜索关键词设成一样，最简单。"
      >
        <TextField
          label="正向词列表"
          value={pos}
          onChange={setPos}
          multiline
          placeholder="bikinilove, swimwearmodel, beachykeen"
        />
      </Section>

      <Section
        title="反向提示词"
        hint="刷推荐页时命中这些词就立即划走。不想看到的常规内容即可，要求不高。全部小写。"
      >
        <TextField
          label="反向词列表"
          value={neg}
          onChange={setNeg}
          multiline
          placeholder="car, pet, food, kids, asmr"
        />
      </Section>

      <Section
        title="评论匹配词"
        hint="进评论区后，评论文字含这些词的，才回复其作者（@他）。留空=不按词筛选、按概率回复。逗号或换行分隔。"
      >
        <TextField
          label="评论匹配词列表"
          value={match}
          onChange={setMatch}
          multiline
          placeholder="where, link, how much, want one"
        />
      </Section>

      <Section
        title="固定回复列表"
        hint="评论回复从这里随机取一条（一行一条）。占位符：{emoji} 随机表情、{a|b|c} 随机择一、{user} @评论作者、{kw} 命中词。例：{user} {love this|so true} {emoji}"
      >
        <TextField
          label="回复列表（一行一条）"
          value={reply}
          onChange={setReply}
          multiline
          placeholder={"this is everything {emoji}\nfacts {emoji}\n{love this|so true} {emoji}"}
        />
      </Section>
    </>
  );
}
