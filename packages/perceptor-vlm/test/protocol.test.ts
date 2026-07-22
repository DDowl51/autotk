import { describe, expect, it } from "vitest";
import { buildFindInstruction, buildOcrInstruction, parseFirstBox, parseOcrResponse } from "../src/protocol";

describe("单目标 find(定位唯一协议)", () => {
  it("指令含短语;解析取第一个框;none → null", () => {
    expect(buildFindInstruction("the avatar of commenter X")).toContain("the avatar of commenter X");
    expect(parseFirstBox("<box><100><200><300><400></box>")).toEqual([0.1, 0.2, 0.3, 0.4]);
    expect(parseFirstBox("none")).toBeNull();
    expect(parseFirstBox("")).toBeNull();
  });

  it("畸形框跳过,取第一个合法框;全畸形 → null", () => {
    expect(parseFirstBox("<box><900><100><100><200></box> <box><100><100><200><200></box>")).toEqual([0.1, 0.1, 0.2, 0.2]);
    expect(parseFirstBox("<box><1200><1><1300><2></box>")).toBeNull(); // 越界
    expect(parseFirstBox("<box><100><100><100><200></box>")).toBeNull(); // 零宽退化
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
