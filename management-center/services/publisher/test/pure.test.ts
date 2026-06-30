import { describe, it, expect } from "vitest";
import { fileKey, filterUnpublished, isPublished, markPublished, emptyManifest } from "../src/dedup";
import { parseCaptionsFile, resolveCaption } from "../src/captions";
import { hmsToSec, toWindows, windowsTotalSec, spread, secsToTimestamps, startOfDayMs } from "../src/scheduler";
import type { VideoItem } from "../src/types";

const vid = (fileName: string, size = 1): VideoItem => ({
  deviceName: "d",
  fileName,
  absPath: `/x/${fileName}`,
  size,
  mtimeMs: 0,
});

describe("dedup", () => {
  it("fileKey = 文件名#大小，改名或改大小都算新文件", () => {
    expect(fileKey(vid("a.mp4", 100))).toBe("a.mp4#100");
    expect(fileKey(vid("a.mp4", 101))).not.toBe(fileKey(vid("a.mp4", 100)));
  });

  it("filterUnpublished 去掉已发的", () => {
    let m = emptyManifest();
    m = markPublished(m, vid("a.mp4"));
    const left = filterUnpublished([vid("a.mp4"), vid("b.mp4")], m);
    expect(left.map((x) => x.fileName)).toEqual(["b.mp4"]);
    expect(isPublished(m, vid("a.mp4"))).toBe(true);
  });

  it("markPublished 不改原 manifest", () => {
    const m0 = emptyManifest();
    markPublished(m0, vid("a.mp4"));
    expect(Object.keys(m0.published)).toHaveLength(0);
  });
});

describe("captions", () => {
  it("parseCaptionsFile 支持 = : Tab 分隔，忽略空行与注释", () => {
    const map = parseCaptionsFile("# c\nv1.mp4 = hello\nv2.mov: world\nv3.m4v\ttabbed\n\n");
    expect(map.get("v1.mp4")).toBe("hello");
    expect(map.get("v2.mov")).toBe("world");
    expect(map.get("v3.m4v")).toBe("tabbed");
  });

  it("resolveCaption 优先级：同名 txt > captions 映射 > 文件名", () => {
    const captionsMap = new Map([["v.mp4", "from-captions"]]);
    expect(resolveCaption("v.mp4", { sameNameTxt: "  same  ", captionsMap })).toBe("same");
    expect(resolveCaption("v.mp4", { captionsMap })).toBe("from-captions");
    expect(resolveCaption("v.mp4", {})).toBe("v");
    expect(resolveCaption("clip.final.mov", {})).toBe("clip.final");
  });
});

describe("scheduler.spread", () => {
  it("hmsToSec / toWindows / windowsTotalSec", () => {
    expect(hmsToSec("01:02:03")).toBe(3723);
    expect(toWindows(true, [])).toEqual([{ startSec: 0, endSec: 86400 }]);
    expect(toWindows(false, [{ start: "09:00:00", end: "12:00:00" }])).toEqual([
      { startSec: 32400, endSec: 43200 },
    ]);
    expect(windowsTotalSec([{ startSec: 0, endSec: 10 }, { startSec: 100, endSec: 110 }])).toBe(20);
  });

  it("count<=0 或无窗口 → []", () => {
    expect(spread(0, [{ startSec: 0, endSec: 100 }])).toEqual([]);
    expect(spread(3, [])).toEqual([]);
  });

  it("单窗口均匀取每段中心（无抖动）", () => {
    expect(spread(2, [{ startSec: 0, endSec: 100 }])).toEqual([25, 75]);
  });

  it("跨多窗口按总时长铺开", () => {
    const secs = spread(4, [{ startSec: 0, endSec: 10 }, { startSec: 100, endSec: 110 }]);
    // offsets 2.5/7.5/12.5/17.5 → 3,8,103,108
    expect(secs).toEqual([3, 8, 103, 108]);
  });

  it("结果升序、且每个点都落在某个窗口内（带抖动）", () => {
    const w = [{ startSec: 0, endSec: 100 }];
    const secs = spread(5, w, { jitterSec: 8, rng: () => 0.9 });
    expect([...secs].sort((a, b) => a - b)).toEqual(secs);
    for (const s of secs) expect(s >= 0 && s <= 99).toBe(true);
  });

  it("secsToTimestamps / startOfDayMs", () => {
    const day = startOfDayMs(new Date("2026-06-27T15:30:00").getTime());
    expect(new Date(day).getHours()).toBe(0);
    expect(secsToTimestamps([0, 60], day)).toEqual([day, day + 60000]);
  });
});
