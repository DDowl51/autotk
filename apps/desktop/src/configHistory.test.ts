import { describe, it, expect } from "vitest";
import { addOp, updateOpResult, describePatchGroups, groupPatch, type ConfigOp } from "./configHistory";

const op = (jobId: string): ConfigOp => ({
  jobId,
  ts: 0,
  deviceCount: 2,
  groups: ["推荐页"],
  patch: {},
  ok: 0,
  failed: 0,
  offline: 0,
  timeout: 0,
  pending: 2,
});

describe("configHistory", () => {
  it("addOp 新记录在最前、按 cap 截断", () => {
    let list: ConfigOp[] = [];
    list = addOp(list, op("a"), 2);
    list = addOp(list, op("b"), 2);
    list = addOp(list, op("c"), 2);
    expect(list.map((o) => o.jobId)).toEqual(["c", "b"]);
  });

  it("updateOpResult 更新对应条目的结果", () => {
    let list = [op("a")];
    list = updateOpResult(list, "a", { ok: 2, failed: 0, offline: 0, timeout: 0, pending: 0 });
    expect(list[0]).toMatchObject({ ok: 2, pending: 0 });
  });

  it("updateOpResult 对不存在的 jobId 原样返回", () => {
    const list = [op("a")];
    expect(updateOpResult(list, "zzz", { ok: 1, failed: 0, offline: 0, timeout: 0, pending: 0 })).toBe(list);
  });

  it("describePatchGroups 推断分组名", () => {
    expect(describePatchGroups({ forYou: { videoLikeProb: 0.5 } })).toEqual(["推荐页"]);
    expect(describePatchGroups({ posPrompts: ["a"], kwSearch: {} }).sort()).toEqual(["关键词", "搜索页"]);
    expect(describePatchGroups({ allDay: true })).toEqual(["时间"]);
    expect(describePatchGroups({ clickWaitTime: 1 })).toEqual(["全局"]);
    expect(describePatchGroups({})).toEqual([]);
  });

  it("groupPatch 按分组归类、只留有改动的组、保持固定顺序", () => {
    const groups = groupPatch({
      forYou: { videoLikeProb: 0.3, commentLikeMaxCount: 4 },
      fixedReplies: ["a", "b"],
      allDay: true,
      kwSearchExecRatio: 0.6,
      taskWindows: [{ start: "09:00:00", end: "12:00:00" }],
    });
    // 顺序：关键词 → 推荐页 → 时间（搜索页/个人主页无改动不出现）
    expect(groups.map((g) => g.group)).toEqual(["关键词", "推荐页", "时间"]);

    const find = (g: string) => groups.find((x) => x.group === g)!;
    const m = (g: string) => Object.fromEntries(find(g).items.map((it) => [it.label, it.value]));
    expect(m("推荐页")["点赞概率"]).toBe("30%");
    expect(m("推荐页")["评论点赞上限"]).toBe("4");
    expect(m("关键词")["固定回复"]).toBe("a / b");
    // 全局节奏字段(搜索互动占比/全天运行)归到「时间」组
    expect(m("时间")["全天运行"]).toBe("开");
    expect(m("时间")["搜索互动占比"]).toBe("60%");
    expect(m("时间")["任务时间段"]).toBe("09:00:00~12:00:00");
  });

  it("空补丁 → 无分组", () => {
    expect(groupPatch({})).toEqual([]);
  });
});
