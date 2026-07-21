// 测试基座:假世界(可控屏上目标 + 假时钟)+ mock Driver/Perceptor。
// 让 decide 引擎完全离线、确定性可测(公理 A1/A2 的镜像:动作改屏,下一帧观测)。
import type { Box, Point, Size } from "../src/geometry";
import type { Driver, Hit, ImageBytes, LocateQuery, Perceptor, TextLine } from "../src/interfaces";

const DEFAULT_BOX: Box = [0.4, 0.4, 0.6, 0.6];

export class FakeWorld {
  clock = 0;
  stop = false;
  size: Size = { width: 750, height: 1334 };
  /** 当前屏上的目标 id → 归一化框。 */
  present = new Map<string, Box>();
  taps: Point[] = [];
  swipes: { from: Point; to: Point; durMs: number }[] = [];
  typed: string[] = [];
  screenshots = 0;
  readTexts = 0; // OCR 读屏次数(验「一次检测」省调用)
  locateCalls: string[][] = []; // 每次 grounding 定位的 id 列表(验危险不逐个 grounding)
  /** OCR 读到的文本行(危险 OCR 二次确认用);默认空。 */
  lines: TextLine[] = [];
  /** 事件时间线:到点(sleep 推进时钟触发)改变屏上目标。 */
  private events: { at: number; fn: () => void; done: boolean }[] = [];
  /** 动作钩子:模拟「点了某处/滑了一下 → 界面变化」。 */
  onTap?: (p: Point, w: FakeWorld) => void;
  onSwipe?: (from: Point, to: Point, w: FakeWorld) => void;

  show(id: string, box: Box = DEFAULT_BOX): this {
    this.present.set(id, box);
    return this;
  }
  hide(id: string): this {
    this.present.delete(id);
    return this;
  }
  at(t: number, fn: () => void): this {
    this.events.push({ at: t, fn, done: false });
    return this;
  }
  private flush(): void {
    for (const e of this.events) {
      if (!e.done && e.at <= this.clock) {
        e.done = true;
        e.fn();
      }
    }
  }

  now = (): number => this.clock;
  sleep = async (ms: number): Promise<void> => {
    this.clock += ms;
    this.flush();
  };
  shouldStop = (): boolean => this.stop;

  driver: Driver = {
    screenshot: async (): Promise<ImageBytes> => {
      this.screenshots++;
      return new Uint8Array(0);
    },
    tap: async (p: Point): Promise<void> => {
      this.taps.push(p);
      this.onTap?.(p, this);
    },
    swipe: async (from: Point, to: Point, durMs: number): Promise<void> => {
      this.swipes.push({ from, to, durMs });
      this.onSwipe?.(from, to, this);
    },
    typeText: async (s: string): Promise<void> => {
      this.typed.push(s);
    },
    activateApp: async (): Promise<void> => {},
    ensureHealthy: async (): Promise<void> => {},
    windowSize: async (): Promise<Size> => this.size,
  };

  perceptor: Perceptor = {
    locate: async (_img: ImageBytes, queries: LocateQuery[]): Promise<Hit[]> => {
      this.locateCalls.push(queries.map((q) => q.id));
      const out: Hit[] = [];
      for (const q of queries) {
        const box = this.present.get(q.id);
        if (box) out.push({ id: q.id, box, score: 0.99 });
      }
      return out;
    },
    readText: async (_img: ImageBytes, region?: Box): Promise<TextLine[]> => {
      this.readTexts++;
      if (!region) return this.lines;
      const [x1, y1, x2, y2] = region;
      return this.lines.filter((l) => {
        const cx = (l.box[0] + l.box[2]) / 2;
        const cy = (l.box[1] + l.box[3]) / 2;
        return cx >= x1 && cx <= x2 && cy >= y1 && cy <= y2;
      });
    },
  };
}
