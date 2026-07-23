import { describe, expect, it, vi } from "vitest";
import { createDeviceLogSink, eventLevel, formatEvent } from "../src/deviceLog";

describe("device log sink", () => {
  it("prints and forwards the same device-scoped line", () => {
    const print = vi.fn();
    const report = vi.fn();
    const sink = createDeviceLogSink({ now: () => 123, print, report });

    sink.log("d1", "tap feed.like", "warn");

    expect(print).toHaveBeenCalledWith("[d1] tap feed.like");
    expect(report).toHaveBeenCalledWith("d1", {
      level: "warn",
      msg: "tap feed.like",
      ts: 123,
    });
  });

  it("formats workflow event data as one searchable line", () => {
    expect(formatEvent("batch_error", { workflow: "search", error: "timeout" })).toBe(
      "«batch_error» {\"workflow\":\"search\",\"error\":\"timeout\"}",
    );
    expect(formatEvent("ready")).toBe("«ready»");
  });

  it("maps actionable events to visible severity", () => {
    expect(eventLevel("batch_error")).toBe("error");
    expect(eventLevel("circuit_open")).toBe("error");
    expect(eventLevel("alert")).toBe("warn");
    expect(eventLevel("step_failed")).toBe("warn");
    expect(eventLevel("hazard_handled")).toBe("info");
  });
});
