// 插件测试基座:FakeApp —— 能识别「点了哪个目标」并触发转场,模拟 app 页面流转。
// 每个目标一个唯一框,tap 落在哪个框中心即认定点了哪个目标(与引擎 centerPx 同算法,精确匹配)。
import type { Box, Driver, Hit, ImageBytes, LocateQuery, Perceptor, Point, StateStore, TextLine } from "@auto/core";

/** 一条评论文本行(单行=作者行,text=作者)。 */
export const cline = (author: string, y: number): TextLine => ({ text: author, box: [0.05, y, 0.35, y + 0.02] });

const SIZE = { width: 750, height: 1334 };
function centerOf(box: Box): Point {
  return { x: ((box[0] + box[2]) / 2) * SIZE.width, y: ((box[1] + box[3]) / 2) * SIZE.height };
}

export class FakeApp {
  clock = 0;
  stop = false;
  size = SIZE;
  present = new Map<string, Box>();
  taps: string[] = []; // 点中的目标 id(未知点记 "?")
  swipes = 0;
  typed: string[] = [];
  /** 当前屏 OCR 文本行(评论解析用)。 */
  lines: TextLine[] = [];
  /** 动态 find:短语含 key 子串则返回 box,并把点击记成 dyn:<key>。 */
  dynFinds: { key: string; box: Box }[] = [];
  /** 点某目标后的转场。 */
  transitions: Record<string, (a: FakeApp) => void> = {};
  /** 盲滑后的转场。 */
  onSwipe?: (a: FakeApp) => void;

  private boxes = new Map<string, Box>();
  private nextY = 0.1;
  private boxFor(id: string): Box {
    let b = this.boxes.get(id);
    if (!b) {
      const y = this.nextY;
      this.nextY += 0.03;
      b = [0.4, y, 0.5, y + 0.01];
      this.boxes.set(id, b);
    }
    return b;
  }

  show(id: string): this {
    this.present.set(id, this.boxFor(id));
    return this;
  }
  hide(id: string): this {
    this.present.delete(id);
    return this;
  }
  on(id: string, fn: (a: FakeApp) => void): this {
    this.transitions[id] = fn;
    return this;
  }
  /** 注册动态 find:任意含 key 子串的短语命中此 box(点击记 dyn:<key>)。 */
  dyn(key: string, box: Box = [0.2, 0.5, 0.3, 0.52]): this {
    this.dynFinds.push({ key, box });
    return this;
  }
  undyn(key: string): this {
    this.dynFinds = this.dynFinds.filter((d) => d.key !== key);
    return this;
  }

  now = (): number => this.clock;
  sleep = async (ms: number): Promise<void> => {
    this.clock += ms;
  };
  shouldStop = (): boolean => this.stop;

  driver: Driver = {
    screenshot: async (): Promise<ImageBytes> => new Uint8Array(0),
    tap: async (p: Point): Promise<void> => {
      for (const [id, box] of this.present) {
        const c = centerOf(box);
        if (Math.abs(c.x - p.x) < 1e-6 && Math.abs(c.y - p.y) < 1e-6) {
          this.taps.push(id);
          this.transitions[id]?.(this);
          return;
        }
      }
      for (const d of this.dynFinds) {
        const c = centerOf(d.box);
        if (Math.abs(c.x - p.x) < 1e-6 && Math.abs(c.y - p.y) < 1e-6) {
          this.taps.push(`dyn:${d.key}`);
          this.transitions[`dyn:${d.key}`]?.(this);
          return;
        }
      }
      this.taps.push("?");
    },
    swipe: async (): Promise<void> => {
      this.swipes++;
      this.onSwipe?.(this);
    },
    typeText: async (s: string): Promise<void> => {
      this.typed.push(s);
    },
    activateApp: async (): Promise<void> => {},
    ensureHealthy: async (): Promise<void> => {},
    windowSize: async () => this.size,
  };

  perceptor: Perceptor = {
    locate: async (_img: ImageBytes, queries: LocateQuery[]): Promise<Hit[]> => {
      const out: Hit[] = [];
      for (const q of queries) {
        const box = this.present.get(q.id);
        if (box) {
          out.push({ id: q.id, box, score: 0.99 });
        } else if (q.id === "_find") {
          const d = this.dynFinds.find((x) => q.phrase.includes(x.key));
          if (d) out.push({ id: "_find", box: d.box, score: 0.95 });
        }
      }
      return out;
    },
    readText: async (_img: ImageBytes, region?: Box): Promise<TextLine[]> => {
      if (!region) return this.lines;
      const [x1, y1, x2, y2] = region;
      return this.lines.filter((l) => {
        const cxx = (l.box[0] + l.box[2]) / 2;
        const cyy = (l.box[1] + l.box[3]) / 2;
        return cxx >= x1 && cxx <= x2 && cyy >= y1 && cyy <= y2;
      });
    },
  };
}

/** 内存 StateStore(去重/限量测试用)。 */
export function memStore(): StateStore {
  const sets = new Map<string, Set<string>>();
  const counts = new Map<string, number>();
  return {
    has: async (ns, key) => sets.get(ns)?.has(key) ?? false,
    add: async (ns, key) => {
      (sets.get(ns) ?? sets.set(ns, new Set()).get(ns)!).add(key);
    },
    peekDaily: async (ns, key) => counts.get(`${ns}:${key}`) ?? 0,
    incrDaily: async (ns, key) => {
      const k = `${ns}:${key}`;
      const v = (counts.get(k) ?? 0) + 1;
      counts.set(k, v);
      return v;
    },
  };
}
