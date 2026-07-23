import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildWorkflowRunSummary,
  identifierSuffix,
  normalizeRunError,
  parseWorkflowTestArgs,
  safePathSegment,
  timestampSegment,
  workflowReadinessError,
} from "../src/workflow-test-cli";

const NOW = new Date("2026-07-23T08:09:10.123Z");
const context = {
  cwd: "/repo",
  packageRoot: "/repo/services/master",
  now: NOW,
  env: {},
};

describe("parseWorkflowTestArgs", () => {
  it("解析必填参数，并生成默认配置和唯一时间戳产物目录", () => {
    const result = parseWorkflowTestArgs(["--device", "01", "--workflow", "search"], context);
    expect(result.help).toBe(false);
    if (result.help) return;
    expect(result.configPath).toBe("/repo/services/master/devices.json");
    expect(result.runId).toBe("2026-07-23T08-09-10-123Z-01-search");
    expect(result.artifactsDir).toBe(
      "/repo/services/master/test-artifacts/2026-07-23T08-09-10-123Z-01-search",
    );
  });

  it("支持等号参数、相对路径和自定义产物根目录", () => {
    const result = parseWorkflowTestArgs(
      [
        "--config=config/devices.local.json",
        "--device=lab/iphone 1",
        "--workflow=profileAndDM",
        "--artifacts=artifacts",
      ],
      context,
    );
    expect(result.help).toBe(false);
    if (result.help) return;
    expect(result.configPath).toBe("/repo/config/devices.local.json");
    expect(result.runId).toContain("lab_iphone_1-profileAndDM");
    expect(result.artifactsDir).toBe(join("/repo/artifacts", result.runId));
  });

  it("MASTER_CONFIG 可提供缺省配置路径，绝对路径保持不变", () => {
    const result = parseWorkflowTestArgs(["--device", "d1", "--workflow", "followMonitor"], {
      ...context,
      env: { MASTER_CONFIG: "/secure/devices.json" },
    });
    expect(result.help).toBe(false);
    if (!result.help) expect(result.configPath).toBe("/secure/devices.json");
  });

  it("拒绝缺参数、非法工作流、未知参数和重复参数", () => {
    expect(() => parseWorkflowTestArgs(["--workflow", "search"], context)).toThrow(/--device/);
    expect(() => parseWorkflowTestArgs(["--device", "d1"], context)).toThrow(/--workflow/);
    expect(() =>
      parseWorkflowTestArgs(["--device", "d1", "--workflow", "publish"], context),
    ).toThrow(/search\|followMonitor\|profileAndDM/);
    expect(() =>
      parseWorkflowTestArgs(["--device", "d1", "--workflow", "search", "--oops", "x"], context),
    ).toThrow(/未知参数/);
    expect(() =>
      parseWorkflowTestArgs(
        ["--device", "d1", "--device", "d2", "--workflow", "search"],
        context,
      ),
    ).toThrow(/重复/);
  });

  it("--help 不要求其它参数", () => {
    expect(parseWorkflowTestArgs(["--help"], context)).toEqual({ help: true });
  });
});

describe("路径和配置就绪纯逻辑", () => {
  it("时间戳和设备 id 都转为跨平台安全目录片段", () => {
    expect(timestampSegment(NOW)).toBe("2026-07-23T08-09-10-123Z");
    expect(safePathSegment("  lab/iphone #1  ")).toBe("lab_iphone_1");
    expect(safePathSegment("///")).toBe("device");
    expect(identifierSuffix("00008110-00123456789ABCDE")).toBe("BCDE");
  });

  it("显式工作流未配置时给出防假绿提示", () => {
    expect(workflowReadinessError("search", { searchKeywords: [] })).toMatch(/searchKeywords/);
    expect(workflowReadinessError("search", { searchKeywords: ["fitness"] })).toBeNull();
    expect(workflowReadinessError("followMonitor", { following: { moduleEnable: false } })).toMatch(
      /moduleEnable=true/,
    );
    expect(workflowReadinessError("followMonitor", { following: { moduleEnable: true } })).toBeNull();
    expect(workflowReadinessError("profileAndDM", { persHome: { moduleEnable: false } })).toMatch(
      /moduleEnable=true/,
    );
    expect(workflowReadinessError("profileAndDM", { persHome: { moduleEnable: true } })).toBeNull();
  });
});

describe("buildWorkflowRunSummary", () => {
  const parsed = parseWorkflowTestArgs(["--device", "01", "--workflow", "search"], context);
  if (parsed.help) throw new Error("unexpected help");

  it("生成稳定的成功摘要和产物存在性", () => {
    const summary = buildWorkflowRunSummary({
      options: parsed,
      finishedAt: new Date("2026-07-23T08:09:12.123Z"),
      status: "success",
      device: {
        id: "01",
        name: "phone",
        udidSuffix: "UDID",
        wdaUrl: "http://192.168.1.51:8100",
        size: { width: 375, height: 667 },
      },
      vlm: { url: "http://gpu:8000", model: "locateanything-3b" },
      stats: { videosWatched: 1 },
      presentFiles: ["run.log", "events.jsonl", "before.png", "after.png"],
    });
    expect(summary).toMatchObject({
      schemaVersion: 1,
      status: "success",
      durationMs: 2000,
      deviceId: "01",
      workflow: "search",
      device: { udidSuffix: "UDID" },
    });
    const artifacts = summary.artifacts as { name: string; present: boolean }[];
    expect(artifacts.find((file) => file.name === "after.png")?.present).toBe(true);
    expect(artifacts.find((file) => file.name === "failure.png")?.present).toBe(false);
    expect(artifacts.find((file) => file.name === "summary.json")?.present).toBe(true);
  });

  it("失败摘要保留规范化错误", () => {
    const error = normalizeRunError(new TypeError("VLM timeout"));
    const summary = buildWorkflowRunSummary({
      options: parsed,
      finishedAt: NOW,
      status: "failed",
      error,
      presentFiles: ["run.log", "events.jsonl", "failure.png"],
    });
    expect(summary).toMatchObject({
      status: "failed",
      error: { name: "TypeError", message: "VLM timeout" },
    });
    expect(normalizeRunError("boom")).toEqual({ name: "Error", message: "boom" });
  });
});
