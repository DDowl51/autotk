// 编排器离线单测:假时钟(手动推进,可打断休眠)+ 假看门狗(手动触发超时)+ 假插件。
// 覆盖 L3 §3:时段窗、独占暂停、模块选择、批超时废批、退避+熔断、每日一次、停机。
import { describe, expect, it, vi } from "vitest";
import { createFleet, type FleetDeps, type PhoneConfig } from "../src/orchestrator";
import { createMemoryStateStore } from "../src/statestore";
import type { Plugin } from "../src/plugin";
import type { Driver, ImageBytes, Perceptor } from "../src/interfaces";
import type { Point, Size } from "../src/geometry";

const SIZE: Size = { width: 750, height: 1334 };

/** 假时钟:sleep 登记到期回调,由 advance() 推进触发(可打断休眠靠 stop 唤醒另一路)。 */
class Clock {
  t = 0;
  private timers: { at: number; fn: () => void }[] = [];
  now = (): number => this.t;
  sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      this.timers.push({ at: this.t + ms, fn: resolve });
    });
  /** 排空微任务队列:让无定时器的异步链(driver 调用/workflow)完整跑完。 */
  private flush = async (): Promise<void> => {
    for (let i = 0; i < 3; i++) await new Promise((r) => setImmediate(r));
  };
  /** 推进到「有回调到期就触发」,每次触发后排空微任务,循环直到该时间点无更多到期。 */
  async advance(ms: number): Promise<void> {
    const target = this.t + ms;
    await this.flush(); // 先让已在飞的批链跑起来(可能还没登记定时器)
    for (;;) {
      const due = this.timers.filter((x) => x.at <= target).sort((a, b) => a.at - b.at);
      if (due.length === 0) break;
      const next = due[0];
      this.t = next.at;
      this.timers = this.timers.filter((x) => x !== next);
      next.fn();
      await this.flush();
    }
    this.t = target;
    await this.flush();
  }
  pending(): number {
    return this.timers.length;
  }
}

/** 手动看门狗:记录待触发的超时,fire() 触发最近一个。 */
class Watchdogs {
  active: { onTimeout: () => void; cancelled: boolean }[] = [];
  make = (_ms: number, onTimeout: () => void): (() => void) => {
    const w = { onTimeout, cancelled: false };
    this.active.push(w);
    return () => {
      w.cancelled = true;
    };
  };
  fireLast(): void {
    const live = this.active.filter((w) => !w.cancelled);
    if (live.length === 0) throw new Error("无活动看门狗可触发");
    live[live.length - 1].onTimeout();
  }
}

function fakeDriver(spy?: { activated: string[] }): Driver {
  return {
    screenshot: async (): Promise<ImageBytes> => new Uint8Array(0),
    tap: async (_p: Point): Promise<void> => {},
    swipe: async (): Promise<void> => {},
    typeText: async (): Promise<void> => {},
    activateApp: async (id: string): Promise<void> => {
      spy?.activated.push(id);
    },
    ensureHealthy: async (): Promise<void> => {},
    windowSize: async (): Promise<Size> => SIZE,
  };
}

const noPerceptor: Perceptor = {
  locate: async () => [],
  readText: async () => [],
};

/** 假插件:工作流按名记录调用序 + 可注入行为(阻塞/抛错)。 */
function fakePlugin(opts: {
  onRun: (name: string) => void;
  behavior?: Record<string, (signal: { stopped: () => boolean }) => Promise<void>>;
  validate?: (p: unknown) => void;
}): Plugin {
  const names = ["search", "profileAndDM", "followMonitor", "recoverToFeed"];
  const wf = (name: string) => async () => {
    opts.onRun(name);
    if (opts.behavior?.[name]) await opts.behavior[name]({ stopped: () => false });
  };
  return {
    id: "fake",
    appId: "com.fake.app",
    targets: [],
    activation: { globalHazards: [], pageHazards: {}, pageExpected: {} },
    workflows: Object.fromEntries(names.map((n) => [n, wf(n)])),
    defaultParams: {},
    validateParams: opts.validate ?? (() => {}),
  };
}

interface Harness {
  clock: Clock;
  wd: Watchdogs;
  runs: string[];
  events: { evt: string; data?: unknown }[];
  deps: FleetDeps;
}

function harness(pluginOverrides: Parameters<typeof fakePlugin>[0] = { onRun: () => {} }, depOverrides: Partial<FleetDeps> = {}): Harness {
  const clock = new Clock();
  const wd = new Watchdogs();
  const runs: string[] = [];
  const events: { evt: string; data?: unknown }[] = [];
  const plugin = fakePlugin({ ...pluginOverrides, onRun: (n) => runs.push(n) });
  const deps: FleetDeps = {
    plugin,
    pickWorkflow: () => "search",
    recoverWorkflow: "recoverToFeed",
    oncePerDay: ["profileAndDM"],
    perceptor: noPerceptor,
    state: createMemoryStateStore(),
    now: clock.now,
    daySeconds: () => 8 * 3600, // 默认 08:00,在默认窗内
    todayKey: () => "2026-7-10",
    sleep: clock.sleep,
    watchdog: wd.make,
    log: () => {},
    onEvent: (_id, evt, data) => events.push({ evt, data }),
    ...depOverrides,
  };
  return { clock, wd, runs, events, deps };
}

const cfg = (over: Partial<PhoneConfig> = {}): PhoneConfig => ({
  id: "d1",
  driver: fakeDriver(),
  size: SIZE,
  params: {},
  schedule: { allDay: true, windows: [] },
  ...over,
});

describe("批循环基础", () => {
  it("跑一批 = 先 recover 再选中的工作流,批间隔后再来", async () => {
    const h = harness();
    const fleet = createFleet(h.deps);
    const phone = fleet.add(cfg());
    await h.clock.advance(10); // 让第一批跑起来
    expect(h.runs.slice(0, 2)).toEqual(["recoverToFeed", "search"]);
    phone.stop();
    await phone.done;
  });

  it("每批先 activateApp(前台守卫)", async () => {
    const spy = { activated: [] as string[] };
    const h = harness();
    const fleet = createFleet(h.deps);
    const phone = fleet.add(cfg({ driver: fakeDriver(spy) }));
    await h.clock.advance(10);
    expect(spy.activated).toContain("com.fake.app");
    phone.stop();
    await phone.done;
  });

  it("pickWorkflow 返回 null → 睡 IDLE_POLL,不跑批", async () => {
    const h = harness({ onRun: () => {} }, { pickWorkflow: () => null });
    const fleet = createFleet(h.deps);
    const phone = fleet.add(cfg());
    await h.clock.advance(5);
    expect(h.runs).toEqual([]);
    phone.stop();
    await phone.done;
  });
});

describe("时段窗", () => {
  it("不在窗内 → 不跑批,睡到点", async () => {
    const h = harness({ onRun: () => {} }, {
      daySeconds: () => 3 * 3600, // 03:00,默认窗外
    });
    const fleet = createFleet(
      { ...h.deps },
    );
    const phone = fleet.add(cfg({ schedule: { allDay: false, windows: [{ start: "07:00:00", end: "11:00:00" }] } }));
    await h.clock.advance(60_000);
    expect(h.runs).toEqual([]);
    phone.stop();
    await phone.done;
  });

  it("allDay=true 忽略窗恒跑", async () => {
    const h = harness({ onRun: () => {} }, { daySeconds: () => 3 * 3600 });
    const fleet = createFleet(h.deps);
    const phone = fleet.add(cfg({ schedule: { allDay: true, windows: [] } }));
    await h.clock.advance(10);
    expect(h.runs).toContain("search");
    phone.stop();
    await phone.done;
  });
});

describe("每日一次(oncePerDay)", () => {
  it("profileAndDM 选中即标记,当天不再被选(先写 key)", async () => {
    let day = "2026-7-10";
    // pick 逻辑:persHome 每天一次;这里模拟「今天没跑过才选它,否则 search」
    const h = harness({ onRun: () => {} }, {
      todayKey: () => day,
      pickWorkflow: (_p, view) => (view.ranToday("profileAndDM") ? "search" : "profileAndDM"),
    });
    const fleet = createFleet(h.deps);
    const phone = fleet.add(cfg());
    await h.clock.advance(100_000); // 多批
    const profiles = h.runs.filter((r) => r === "profileAndDM").length;
    expect(profiles).toBe(1); // 当天仅一次
    expect(h.runs.filter((r) => r === "search").length).toBeGreaterThan(0);
    phone.stop();
    await phone.done;
  });
});

describe("超时废批 + 退避", () => {
  it("看门狗触发 → 批异常,记 batch_error,退避后重来", async () => {
    // holder 对象避免 CFA 把 release 收窄成 null/never(赋值在嵌套回调里)。
    const box: { release: (() => void) | null } = { release: null };
    let calls = 0;
    const h = harness(
      {
        onRun: () => {},
        behavior: {
          search: () => new Promise<void>((res) => { box.release = res; }), // 卡住不返回
        },
      },
      { pickWorkflow: () => (calls++ === 0 ? "search" : null) }, // 只第一批跑 search,废批后空转(不再起阻塞批)
    );
    const fleet = createFleet(h.deps);
    const phone = fleet.add(cfg());
    await h.clock.advance(10); // 进 search,卡住
    expect(h.runs).toContain("search");
    h.wd.fireLast(); // 模块超时 → 废批 + reject
    box.release?.(); // 迟到返回(废批后应被忽略,不影响)
    await h.clock.advance(5000); // 退避后 pick 返回 null → 空转
    expect(h.events.some((e) => e.evt === "batch_error")).toBe(true);
    phone.stop();
    await phone.done;
  });

  it("连续失败到阈值 → 熔断冷却事件", async () => {
    const h = harness({
      onRun: () => {},
      behavior: {
        search: async () => {
          throw new Error("boom");
        },
      },
    });
    const fleet = createFleet(h.deps);
    const phone = fleet.add(cfg());
    // 跑够 5 批失败(每批后退避,推进时钟覆盖退避）
    await h.clock.advance(500_000);
    expect(h.events.some((e) => e.evt === "circuit_open")).toBe(true);
    const errs = h.events.filter((e) => e.evt === "batch_error");
    expect(errs.length).toBeGreaterThanOrEqual(5);
    phone.stop();
    await phone.done;
  });
});

describe("独占(发布串行不抢前台)", () => {
  it("runExclusive 暂停批循环,跑完恢复", async () => {
    const h = harness();
    const fleet = createFleet(h.deps);
    const phone = fleet.add(cfg());
    await h.clock.advance(10);
    const before = h.runs.length;
    let ran = false;
    const p = phone.runExclusive("publish", async () => {
      ran = true;
      return "done";
    });
    await h.clock.advance(600); // 等它等到 busy=false 的轮询
    await expect(p).resolves.toBe("done");
    expect(ran).toBe(true);
    void before;
    phone.stop();
    await phone.done;
  });
});

describe("参数热更与校验", () => {
  it("updateParams 非法 → 抛错不生效", async () => {
    const h = harness({ onRun: () => {}, validate: (p) => { if ((p as { bad?: boolean }).bad) throw new Error("非法"); } });
    const fleet = createFleet(h.deps);
    const phone = fleet.add(cfg());
    await h.clock.advance(10);
    expect(() => phone.updateParams({ bad: true })).toThrow(/非法/);
    phone.stop();
    await phone.done;
  });

  it("启动前参数非法 → 不启动,置 alert", async () => {
    const h = harness({ onRun: () => {}, validate: () => { throw new Error("启动校验失败"); } });
    const fleet = createFleet(h.deps);
    const phone = fleet.add(cfg());
    await phone.done; // 立即结束(未启动循环)
    expect(phone.getAlert()).toMatch(/未启动/);
    expect(h.runs).toEqual([]);
  });
});

describe("停机", () => {
  it("stop() 唤醒休眠、废批、done 兑现", async () => {
    const h = harness();
    const fleet = createFleet(h.deps);
    const phone = fleet.add(cfg());
    await h.clock.advance(10);
    phone.stop();
    await expect(phone.done).resolves.toBeUndefined();
  });

  it("fleet.stopAll 停全部", async () => {
    const h = harness();
    const fleet = createFleet(h.deps);
    fleet.add(cfg({ id: "d1" }));
    fleet.add(cfg({ id: "d2" }));
    await h.clock.advance(10);
    expect(fleet.list()).toHaveLength(2);
    await fleet.stopAll();
    expect(fleet.list()).toHaveLength(0);
  });

  it("重复 id → 报错", () => {
    const h = harness();
    const fleet = createFleet(h.deps);
    fleet.add(cfg({ id: "d1" }));
    expect(() => fleet.add(cfg({ id: "d1" }))).toThrow(/重复/);
  });
});

describe("远程启停 pause/resume", () => {
  it("pause 后不再跑新批;resume 后恢复(下批仍先 recover)", async () => {
    const h = harness();
    const fleet = createFleet(h.deps);
    const phone = fleet.add(cfg());
    await h.clock.advance(10);
    expect(h.runs.slice(0, 2)).toEqual(["recoverToFeed", "search"]);
    const before = h.runs.length;

    phone.pause();
    expect(phone.isPaused()).toBe(true);
    await h.clock.advance(120_000); // 推进很久
    expect(h.runs.length).toBe(before); // 暂停期间没跑新工作流

    phone.resume();
    expect(phone.isPaused()).toBe(false);
    await h.clock.advance(10);
    expect(h.runs.slice(before, before + 2)).toEqual(["recoverToFeed", "search"]); // 恢复后先 recover 再跑

    phone.stop();
    await phone.done;
  });

  it("pause 期间 stop 仍能退出", async () => {
    const h = harness();
    const fleet = createFleet(h.deps);
    const phone = fleet.add(cfg());
    await h.clock.advance(10);
    phone.pause();
    await h.clock.advance(1000);
    phone.stop(); // 暂停中请求停止
    await phone.done; // 能退出,不卡死
    expect(phone.isPaused()).toBe(true); // 暂停标志不影响退出
  });
});
