import { describe, expect, it } from "vitest";
import {
  buildFindInstruction,
  buildLocateInstruction,
  buildOcrInstruction,
  parseFirstBox,
  parseLocateResponse,
  parseOcrResponse,
} from "../src/protocol";
import type { LocateQuery } from "@auto/core";

const Q: LocateQuery[] = [
  { id: "feed.like", phrase: "the like heart button" },
  { id: "sys.location-perm", phrase: "the Don't Allow button" },
];

describe("组合定位指令", () => {
  it("按序号列出各目标短语,并说明 box/none 输出格式", () => {
    const s = buildLocateInstruction(Q);
    expect(s).toContain("1. the like heart button");
    expect(s).toContain("2. the Don't Allow button");
    expect(s).toContain("<box><x1><y1><x2><y2></box>");
    expect(s).toContain("none");
  });
});

describe("组合定位解析", () => {
  it("正常多行:按序号映射回 id,坐标 /1000 归一化", () => {
    const hits = parseLocateResponse("1: <box><830><440><900><500></box>\n2: none", Q);
    expect(hits).toHaveLength(1);
    expect(hits[0].id).toBe("feed.like");
    expect(hits[0].box).toEqual([0.83, 0.44, 0.9, 0.5]);
    expect(hits[0].score).toBe(1);
  });

  it("乱序/夹杂废话也能解析;none 与缺行 = 缺席", () => {
    const raw = "sure! here are the results:\n2: <box><100><200><300><400></box>\nsomething else";
    const hits = parseLocateResponse(raw, Q);
    expect(hits.map((h) => h.id)).toEqual(["sys.location-perm"]);
  });

  it("重复序号只取第一次;越界序号忽略", () => {
    const raw = "1: <box><10><10><20><20></box>\n1: <box><500><500><600><600></box>\n9: <box><1><1><2><2></box>";
    const hits = parseLocateResponse(raw, Q);
    expect(hits).toHaveLength(1);
    expect(hits[0].box).toEqual([0.01, 0.01, 0.02, 0.02]);
  });

  it("全 none / 空响应 → 空数组", () => {
    expect(parseLocateResponse("1: none\n2: none", Q)).toEqual([]);
    expect(parseLocateResponse("", Q)).toEqual([]);
  });

  it("坐标 >1000 的越界框丢弃(当缺席,不产出 >1 的『归一化』坐标)", () => {
    expect(parseLocateResponse("1: <box><1200><400><1500><600></box>", Q)).toEqual([]);
  });

  it("退化框(x1≥x2 / y1≥y2)丢弃;且不占序号——后续同序号合法行仍可用", () => {
    expect(parseLocateResponse("1: <box><500><400><100><600></box>", Q)).toEqual([]);
    expect(parseLocateResponse("1: <box><100><100><100><200></box>", Q)).toEqual([]); // 零宽
    const hits = parseLocateResponse("1: <box><500><400><100><600></box>\n1: <box><100><100><200><200></box>", Q);
    expect(hits).toHaveLength(1);
    expect(hits[0].box).toEqual([0.1, 0.1, 0.2, 0.2]);
  });

  it("叙述句末尾的「数字:」+ 下一行裸框:不跨行误绑定", () => {
    const raw = "Here are the boxes for items 1 and 2:\n<box><100><200><300><400></box>";
    expect(parseLocateResponse(raw, Q)).toEqual([]);
    // 行内空格仍容忍
    expect(parseLocateResponse("2 : <box><100><200><300><400></box>", Q)).toHaveLength(1);
  });
});

describe("单目标 find", () => {
  it("指令含短语;解析取第一个框", () => {
    expect(buildFindInstruction("the avatar of commenter X")).toContain("the avatar of commenter X");
    expect(parseFirstBox("<box><100><200><300><400></box>")).toEqual([0.1, 0.2, 0.3, 0.4]);
    expect(parseFirstBox("none")).toBeNull();
  });

  it("畸形框跳过,取第一个合法框;全畸形 → null", () => {
    expect(parseFirstBox("<box><900><100><100><200></box> <box><100><100><200><200></box>")).toEqual([0.1, 0.1, 0.2, 0.2]);
    expect(parseFirstBox("<box><1200><1><1300><2></box>")).toBeNull();
  });
});

describe("OCR 指令", () => {
  it("默认全图;带 region 时把归一化区域转 0-1000 <box> 写进指令", () => {
    expect(buildOcrInstruction()).not.toContain("region <box>");
    const s = buildOcrInstruction([0.0, 0.77, 0.72, 0.9]);
    expect(s).toContain("<box><0><770><720><900></box>");
  });
});

describe("OCR 解析", () => {
  it("逐行「<box>…</box> 文字」→ TextLine[];坐标 /1000;文本 trim", () => {
    const raw = "<box><50><800><500><830></box> 好看的视频 #beach\n<box><50><840><400><870></box>  second line  ";
    const lines = parseOcrResponse(raw);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual({ text: "好看的视频 #beach", box: [0.05, 0.8, 0.5, 0.83] });
    expect(lines[1].text).toBe("second line");
  });

  it("无框的行/空响应忽略", () => {
    expect(parseOcrResponse("just some chatter\n\n")).toEqual([]);
    const lines = parseOcrResponse("noise\n<box><10><20><30><40></box> ok");
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe("ok");
  });

  it("一行挤两条结果:按框切分成两条,标签不混入文本", () => {
    const lines = parseOcrResponse("<box><1><2><3><4></box> foo <box><5><6><7><8></box> bar");
    expect(lines.map((l) => l.text)).toEqual(["foo", "bar"]);
    expect(lines[1].box).toEqual([0.005, 0.006, 0.007, 0.008]);
  });

  it("文本含 < 符号(如 <3)不受影响;畸形框/纯框无文本丢弃", () => {
    expect(parseOcrResponse("<box><10><20><30><40></box> 爱你 <3")[0].text).toBe("爱你 <3");
    expect(parseOcrResponse("<box><1200><20><1300><40></box> x")).toEqual([]); // 越界
    expect(parseOcrResponse("<box><10><20><30><40></box>")).toEqual([]); // 空文本
  });
});
