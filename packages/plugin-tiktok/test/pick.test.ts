import { describe, expect, it } from "vitest";
import { pickWorkflow } from "../src/pick";
import { defaultParams, type TikTokParams } from "../src/params";

const params = (over: Partial<TikTokParams>): TikTokParams => ({ ...defaultParams, ...over });
const view = (ran: string[] = []) => ({ ranToday: (n: string) => ran.includes(n) });

describe("pickWorkflow", () => {
  describe("显式 activeWorkflow(下拉框)优先", () => {
    it("off → null", () => {
      expect(pickWorkflow(params({ activeWorkflow: "off", following: { ...defaultParams.following, moduleEnable: true } }), view())).toBeNull();
    });
    it("followMonitor → 直接跑(不看 moduleEnable)", () => {
      expect(pickWorkflow(params({ activeWorkflow: "followMonitor" }), view())).toBe("followMonitor");
    });
    it("search:有词→search;无词→null", () => {
      expect(pickWorkflow(params({ activeWorkflow: "search", searchKeywords: ["cat"] }), view())).toBe("search");
      expect(pickWorkflow(params({ activeWorkflow: "search", searchKeywords: [] }), view())).toBeNull();
    });
    it("profileAndDM:今天没跑→跑;跑过→null(每日一次)", () => {
      expect(pickWorkflow(params({ activeWorkflow: "profileAndDM" }), view())).toBe("profileAndDM");
      expect(pickWorkflow(params({ activeWorkflow: "profileAndDM" }), view(["profileAndDM"]))).toBeNull();
    });
    it("显式选定压过 moduleEnable(选 search 时 following 开着也不打粉)", () => {
      const p = params({ activeWorkflow: "search", searchKeywords: ["x"], following: { ...defaultParams.following, moduleEnable: true } });
      expect(pickWorkflow(p, view())).toBe("search");
    });
  });

  describe("缺省(不设 activeWorkflow)回落旧 moduleEnable 优先级", () => {
    it("following 开 → followMonitor(排他)", () => {
      expect(pickWorkflow(params({ following: { ...defaultParams.following, moduleEnable: true } }), view())).toBe("followMonitor");
    });
    it("persHome 开且今天没跑 → profileAndDM", () => {
      expect(pickWorkflow(params({ persHome: { ...defaultParams.persHome, moduleEnable: true } }), view())).toBe("profileAndDM");
    });
    it("有搜索词 → search", () => {
      expect(pickWorkflow(params({ searchKeywords: ["cat"] }), view())).toBe("search");
    });
    it("什么都没配 → null", () => {
      expect(pickWorkflow(params({}), view())).toBeNull();
    });
  });
});
