import { describe, expect, it } from "vitest";
import { createRunContext, emptyStats } from "../src/context";
import { toRegistry } from "../src/target";
import type { Hit, ImageBytes, LocateQuery, Perceptor, TextLine } from "../src/interfaces";
import { FakeWorld } from "./fake";

// 记忆型 StateStore
function memStore() {
  const sets = new Map<string, Set<string>>();
  const counts = new Map<string, number>();
  return {
    has: async (ns: string, k: string) => sets.get(ns)?.has(k) ?? false,
    add: async (ns: string, k: string) => {
      (sets.get(ns) ?? sets.set(ns, new Set()).get(ns)!).add(k);
    },
    incrDaily: async (ns: string, k: string) => {
      const key = `${ns}:${k}`;
      const v = (counts.get(key) ?? 0) + 1;
      counts.set(key, v);
      return v;
    },
  };
}

/** 让 FakeWorld 的 perceptor 支持动态 find(短语含关键子串则返回框)+ OCR 行。 */
function withDyn(w: FakeWorld, dyn: Record<string, [number, number, number, number]>, lines: TextLine[] = []): FakeWorld {
  const base = w.perceptor;
  w.perceptor = {
    locate: async (img: ImageBytes, queries: LocateQuery[]): Promise<Hit[]> => {
      const out = await base.locate(img, queries);
      for (const q of queries) {
        if (q.id === "_find") {
          for (const [key, box] of Object.entries(dyn)) {
            if (q.phrase.includes(key)) {
              out.push({ id: "_find", box, score: 0.95 });
              break;
            }
          }
        }
      }
      return out;
    },
    readText: async (): Promise<TextLine[]> => lines,
  } as Perceptor;
  return w;
}

function ctxOf(w: FakeWorld) {
  return createRunContext({
    driver: w.driver,
    perceptor: w.perceptor,
    targets: toRegistry([]),
    size: w.size,
    now: w.now,
    sleep: w.sleep,
    shouldStop: w.shouldStop,
    globalHazards: [],
    params: {},
    state: memStore(),
    stats: emptyStats(),
    withinWindow: () => true,
    rng: () => 0.42,
  });
}

describe("RunContext.find / findAndTap", () => {
  it("动态短语命中 → 返回像素中心", async () => {
    const w = withDyn(new FakeWorld(), { "like heart": [0.8, 0.4, 0.9, 0.5] });
    const ctx = ctxOf(w);
    const p = await ctx.find('the like heart of comment "hi"');
    expect(p).not.toBeNull();
    expect(p!.x).toBeCloseTo(0.85 * 750, 6);
  });
  it("未命中 → null", async () => {
    const ctx = ctxOf(withDyn(new FakeWorld(), {}));
    expect(await ctx.find("nothing here")).toBeNull();
  });
  it("findAndTap 命中则点、返回 true;未命中 false 不点", async () => {
    const w = withDyn(new FakeWorld(), { "reply link": [0.2, 0.5, 0.3, 0.55] });
    const ctx = ctxOf(w);
    expect(await ctx.findAndTap("the reply link")).toBe(true);
    expect(w.taps).toHaveLength(1);
    expect(await ctx.findAndTap("absent")).toBe(false);
    expect(w.taps).toHaveLength(1);
  });
});

describe("RunContext.readLines / readText", () => {
  it("readLines 返回带坐标的行;readText 只返回文字", async () => {
    const lines: TextLine[] = [
      { text: "alice", box: [0.05, 0.3, 0.2, 0.32] },
      { text: "nice video", box: [0.05, 0.33, 0.4, 0.35] },
    ];
    const ctx = ctxOf(withDyn(new FakeWorld(), {}, lines));
    expect(await ctx.readLines()).toEqual(lines);
    expect(await ctx.readText()).toEqual(["alice", "nice video"]);
  });
});

describe("RunContext.swipe / random / size", () => {
  it("swipe 透传到 driver", async () => {
    const w = new FakeWorld();
    const ctx = ctxOf(w);
    await ctx.swipe({ x: 1, y: 2 }, { x: 3, y: 4 }, 300);
    expect(w.swipes[0]).toMatchObject({ from: { x: 1, y: 2 }, to: { x: 3, y: 4 }, durMs: 300 });
  });
  it("random 用注入 rng;size 暴露分辨率", async () => {
    const ctx = ctxOf(new FakeWorld());
    expect(ctx.random()).toBe(0.42);
    expect(ctx.size).toEqual({ width: 750, height: 1334 });
  });
});
