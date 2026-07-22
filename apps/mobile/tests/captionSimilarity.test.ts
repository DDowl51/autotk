import test from "node:test";
import assert from "node:assert/strict";
import {
  captionSimilarity,
  looksSameCaption,
  isCaptionComparable,
} from "../src/engine/captionSimilarity";

test("完全相同的文案 → 相似度 1、判为同一条", () => {
  const c = "美丽的多洛米蒂山脉 #travel #mountains 一定要去看看这里";
  assert.equal(captionSimilarity(c, c), 1);
  assert.equal(looksSameCaption(c, c), true);
});

test("同一条视频、OCR 细微差异（1 字错读）→ 仍判为同一条", () => {
  const a = "beautiful dolomites mountains #travel #nature love this view so much";
  const b = "beautiful dolomites mountains #travel #nature love this vlew so much"; // view→vlew
  assert.ok(captionSimilarity(a, b) > 0.9, `相似度应很高，实际 ${captionSimilarity(a, b)}`);
  assert.equal(looksSameCaption(a, b), true);
});

test("完全不同的两条 → 相似度低、判为已划动（不是同一条）", () => {
  const a = "beautiful dolomites mountains hiking trip in italy summer";
  const b = "cute cat playing with a yarn ball so funny lol must watch";
  assert.ok(captionSimilarity(a, b) < 0.6, `相似度应较低，实际 ${captionSimilarity(a, b)}`);
  assert.equal(looksSameCaption(a, b), false);
});

test("只是共享几个话题标签、正文不同 → 不判为同一条（避免误报没划动）", () => {
  const a = "#summer #beach party time with friends at the coast yeah";
  const b = "#summer #beach morning workout routine leg day grind";
  assert.equal(looksSameCaption(a, b), false);
});

test("文案过短/为空 → 不可比较，一律判为「已划动」（OCR 未接入时退回旧行为，防死循环脱困）", () => {
  assert.equal(isCaptionComparable(""), false);
  assert.equal(isCaptionComparable("🔥"), false);
  assert.equal(isCaptionComparable("hi"), false);
  assert.equal(looksSameCaption("", ""), false); // 关键：空==空 不能判成「同一条」
  assert.equal(looksSameCaption("🔥", "🔥"), false);
  assert.equal(isCaptionComparable("beautiful mountains"), true);
});

test("阈值可调：同一条（仅 1 字 OCR 差）在默认阈值判同、在极严阈值判异", () => {
  const a = "beautiful dolomites mountains #travel #nature love this view so much";
  const b = "beautiful dolomites mountains #travel #nature love this vlew so much"; // 1 字差
  assert.equal(looksSameCaption(a, b, { threshold: 0.85 }), true); // ~0.96 ≥ 0.85
  assert.equal(looksSameCaption(a, b, { threshold: 0.999 }), false); // 有 1 字差，达不到 0.999
});
