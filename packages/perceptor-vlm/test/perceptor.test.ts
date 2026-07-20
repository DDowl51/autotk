import { describe, expect, it } from "vitest";
import { createVlmPerceptor } from "../src/perceptor";
import type { InferOpts, PerceptorBackend } from "../src/backend";
import type { ImageBytes } from "@auto/core";

/** 假后端:记录指令,按队列回放响应。 */
class FakeBackend implements PerceptorBackend {
  calls: { instruction: string; opts?: InferOpts }[] = [];
  responses: string[] = [];
  async infer(_img: ImageBytes, instruction: string, opts?: InferOpts): Promise<string> {
    this.calls.push({ instruction, opts });
    return this.responses.shift() ?? "";
  }
}

const IMG: ImageBytes = new Uint8Array([1]);

describe("locate", () => {
  it("hazards+expected 拼进同一条组合指令(每步一次推理)", async () => {
    const b = new FakeBackend();
    b.responses.push("1: <box><100><100><200><200></box>\n2: <box><700><700><800><800></box>");
    const p = createVlmPerceptor({ backend: b });
    const hits = await p.locate(IMG, [
      { id: "sys.perm", phrase: "the Don't Allow button" },
      { id: "feed.like", phrase: "the like heart" },
    ]);
    expect(b.calls).toHaveLength(1);
    expect(b.calls[0].instruction).toContain("1. the Don't Allow button");
    expect(b.calls[0].instruction).toContain("2. the like heart");
    expect(hits.map((h) => h.id)).toEqual(["sys.perm", "feed.like"]);
  });

  it("空 queries 不调后端,直接 []", async () => {
    const b = new FakeBackend();
    const p = createVlmPerceptor({ backend: b });
    expect(await p.locate(IMG, [])).toEqual([]);
    expect(b.calls).toHaveLength(0);
  });

  it("region 后过滤:命中框中心在先验区域外 → 丢弃(治幻觉)", async () => {
    const b = new FakeBackend();
    // 目标声明在上半屏,模型却框到下半屏 → 应被拒
    b.responses.push("1: <box><400><800><600><900></box>");
    const p = createVlmPerceptor({ backend: b });
    const hits = await p.locate(IMG, [{ id: "t", phrase: "x", region: [0, 0, 1, 0.5] }]);
    expect(hits).toEqual([]);
  });

  it("region 内的命中保留;无 region 不过滤", async () => {
    const b = new FakeBackend();
    b.responses.push("1: <box><400><100><600><200></box>\n2: <box><400><800><600><900></box>");
    const p = createVlmPerceptor({ backend: b });
    const hits = await p.locate(IMG, [
      { id: "in", phrase: "a", region: [0, 0, 1, 0.5] },
      { id: "free", phrase: "b" },
    ]);
    expect(hits.map((h) => h.id)).toEqual(["in", "free"]);
  });

  it("退化 region([x,y,w,h] 漏转换)→ fail-fast 抛错,绝不静默全过滤", async () => {
    const b = new FakeBackend();
    const p = createVlmPerceptor({ backend: b });
    // 注册表原始格式 [x=0.82, y=0.4, w=0.18, h=0.2]:按角点读 x2<x1,是编程错误
    await expect(p.locate(IMG, [{ id: "t", phrase: "x", region: [0.82, 0.4, 0.18, 0.2] }])).rejects.toThrow(/x,y,w,h/);
    await expect(p.readText(IMG, [0.82, 0.4, 0.18, 0.2])).rejects.toThrow(/x,y,w,h/);
    expect(b.calls).toHaveLength(0); // 坏参数不该打后端
  });

  it("maxTokens 随目标数增长,可用 locateMaxTokens 锁定", async () => {
    const b = new FakeBackend();
    b.responses.push("1: none", "1: none"); // 服从的缺席(空响应会触发 P1 退化,干扰调用计数)
    const p = createVlmPerceptor({ backend: b });
    await p.locate(IMG, Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, phrase: `p${i}` })));
    expect(b.calls[0].opts?.maxTokens).toBe(16 + 24 * 10);
    const p2 = createVlmPerceptor({ backend: b, locateMaxTokens: 512 });
    await p2.locate(IMG, [{ id: "t", phrase: "p" }]);
    expect(b.calls[1].opts?.maxTokens).toBe(512);
  });

  it("P1 退化:组合完全不被服从(叙述文本)→ 只查第一个目标(=最高优先)", async () => {
    const b = new FakeBackend();
    b.responses.push(
      "I can see a permission dialog and a heart icon in this screenshot.", // 无任何 <n>: 行
      "<box><100><100><200><200></box>",
    );
    const p = createVlmPerceptor({ backend: b });
    const hits = await p.locate(IMG, [
      { id: "sys.perm", phrase: "the Don't Allow button" }, // 引擎拼查询 hazards 在前
      { id: "feed.like", phrase: "the like heart" },
    ]);
    expect(b.calls).toHaveLength(2);
    expect(b.calls[1].instruction).toContain("the Don't Allow button"); // 单目标指令,只问第一个
    expect(b.calls[1].instruction).not.toContain("the like heart");
    expect(hits).toEqual([{ id: "sys.perm", box: [0.1, 0.1, 0.2, 0.2], score: 1 }]);
  });

  it("P1 不误触发:全 none 是「服从的缺席」→ 不退化,只调一次", async () => {
    const b = new FakeBackend();
    b.responses.push("1: none\n2: none");
    const p = createVlmPerceptor({ backend: b });
    const hits = await p.locate(IMG, [
      { id: "a", phrase: "x" },
      { id: "b", phrase: "y" },
    ]);
    expect(hits).toEqual([]);
    expect(b.calls).toHaveLength(1);
  });

  it("P1 退化的命中同样过 region 后过滤", async () => {
    const b = new FakeBackend();
    b.responses.push("no idea", "<box><400><800><600><900></box>"); // 退化返回下半屏框
    const p = createVlmPerceptor({ backend: b });
    const hits = await p.locate(IMG, [{ id: "t", phrase: "x", region: [0, 0, 1, 0.5] }]); // 先验在上半屏
    expect(b.calls).toHaveLength(2);
    expect(hits).toEqual([]); // 区域外 → 丢弃,宁缺勿乱
  });
});

describe("readText", () => {
  it("走 OCR 指令,解析成 TextLine;默认 maxTokens 1024", async () => {
    const b = new FakeBackend();
    b.responses.push("<box><50><800><500><830></box> hello");
    const p = createVlmPerceptor({ backend: b });
    const lines = await p.readText(IMG);
    expect(b.calls[0].instruction).toContain("Read all visible text");
    expect(b.calls[0].opts?.maxTokens).toBe(1024);
    expect(lines).toEqual([{ text: "hello", box: [0.05, 0.8, 0.5, 0.83] }]);
  });

  it("region:指令带区域提示,且区域外的行被过滤", async () => {
    const b = new FakeBackend();
    b.responses.push("<box><100><100><300><150></box> outside\n<box><100><800><300><850></box> inside");
    const p = createVlmPerceptor({ backend: b });
    const lines = await p.readText(IMG, [0, 0.7, 1, 1]);
    expect(b.calls[0].instruction).toContain("<box><0><700><1000><1000></box>");
    expect(lines.map((l) => l.text)).toEqual(["inside"]);
  });

  it("ocrBackend 给了就走独立 OCR 后端(为 PaddleOCR 壳留门)", async () => {
    const main = new FakeBackend();
    const ocr = new FakeBackend();
    ocr.responses.push("<box><10><20><30><40></box> via-ocr");
    const p = createVlmPerceptor({ backend: main, ocrBackend: ocr });
    const lines = await p.readText(IMG);
    expect(main.calls).toHaveLength(0);
    expect(ocr.calls).toHaveLength(1);
    expect(lines[0].text).toBe("via-ocr");
  });
});
