import { describe, expect, it } from "vitest";
import type { ConfigPatch } from "@mc/shared";
import { applyConfigPatch } from "../src/hub/configInbox";

const baseParams = {
  searchKeywords: [] as string[],
  clickWaitTime: 1,
  kwSearch: { interactProb: 0.45, videoLikeProb: 0.5 },
  dm: { dmEnable: false, dmDailyCap: 20 },
};
const baseSchedule = { allDay: false, windows: [{ start: "07:00:00", end: "11:00:00" }] };

describe("applyConfigPatch", () => {
  it("params 字段深合并(只改填了的,其余保留)", () => {
    const patch: ConfigPatch = { searchKeywords: ["cat"], kwSearch: { videoLikeProb: 0.9 } };
    const r = applyConfigPatch(baseParams, baseSchedule, patch);
    const p = r.params as typeof baseParams;
    expect(p.searchKeywords).toEqual(["cat"]);
    expect(p.kwSearch.videoLikeProb).toBe(0.9); // 改了
    expect(p.kwSearch.interactProb).toBe(0.45); // 深合并保留
    expect(p.dm.dmDailyCap).toBe(20); // 未动
    expect(r.schedule).toBeUndefined(); // 无 schedule 字段 → 不返回 schedule
  });

  it("allDay/taskWindows 路由到 schedule,不进 params", () => {
    const patch: ConfigPatch = { allDay: true, taskWindows: [{ start: "08:00:00", end: "20:00:00" }] };
    const r = applyConfigPatch(baseParams, baseSchedule, patch);
    expect(r.schedule).toEqual({ allDay: true, windows: [{ start: "08:00:00", end: "20:00:00" }] });
    const p = r.params as Record<string, unknown> | undefined;
    // schedule 字段不应污染 params
    if (p) {
      expect("allDay" in p).toBe(false);
      expect("taskWindows" in p).toBe(false);
    }
  });

  it("同时含 params 与 schedule 字段 → 两者都返回", () => {
    const patch: ConfigPatch = { clickWaitTime: 3, allDay: true };
    const r = applyConfigPatch(baseParams, baseSchedule, patch);
    expect((r.params as typeof baseParams).clickWaitTime).toBe(3);
    expect(r.schedule?.allDay).toBe(true);
    expect(r.schedule?.windows).toEqual(baseSchedule.windows); // allDay 单独改,windows 沿用
  });

  it("空 patch → params/schedule 均不返回", () => {
    const r = applyConfigPatch(baseParams, baseSchedule, {});
    expect(r.params).toBeUndefined();
    expect(r.schedule).toBeUndefined();
  });

  it("只给 taskWindows(不给 allDay)→ schedule 用原 allDay + 新 windows", () => {
    const r = applyConfigPatch(baseParams, baseSchedule, { taskWindows: [{ start: "09:00:00", end: "10:00:00" }] });
    expect(r.schedule).toEqual({ allDay: false, windows: [{ start: "09:00:00", end: "10:00:00" }] });
  });
});
