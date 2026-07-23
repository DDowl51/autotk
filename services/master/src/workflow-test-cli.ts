import { isAbsolute, join, resolve } from "node:path";

export const WORKFLOW_TEST_NAMES = ["search", "followMonitor", "profileAndDM"] as const;
export type WorkflowTestName = (typeof WORKFLOW_TEST_NAMES)[number];

export interface WorkflowTestOptions {
  configPath: string;
  deviceId: string;
  workflow: WorkflowTestName;
  artifactsDir: string;
  runId: string;
  startedAt: Date;
}

export type ParsedWorkflowTestCli = { help: true } | ({ help: false } & WorkflowTestOptions);

export interface ParseWorkflowTestContext {
  cwd: string;
  packageRoot: string;
  now?: Date;
  env?: Record<string, string | undefined>;
}

export interface WorkflowRunError {
  name: string;
  message: string;
  stack?: string;
}

export interface WorkflowRunSummaryInput {
  options: WorkflowTestOptions;
  finishedAt: Date;
  status: "success" | "failed";
  device?: {
    id: string;
    name: string;
    udidSuffix: string;
    wdaUrl: string;
    size?: { width: number; height: number };
  };
  vlm?: {
    url: string;
    model: string;
  };
  stats?: unknown;
  error?: WorkflowRunError;
  presentFiles: readonly string[];
}

function requireValue(flag: string, inline: string | undefined, argv: string[], index: number): [string, number] {
  if (inline !== undefined) {
    if (inline.length === 0) throw new Error(`${flag} 缺少值`);
    return [inline, index];
  }
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} 缺少值`);
  return [value, index + 1];
}

function pathFrom(base: string, value: string): string {
  return isAbsolute(value) ? value : resolve(base, value);
}

/** ISO 时间转文件名安全形式，保留毫秒以避免连续两次运行撞目录。 */
export function timestampSegment(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

/** 设备 id 可能来自用户配置；目录名只保留跨平台安全字符。 */
export function safePathSegment(value: string): string {
  const safe = value.trim().replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^[_\-.]+|[_\-.]+$/g, "");
  return safe || "device";
}

/** 反馈产物不落完整硬件标识，只保留可与库存核对的末四位。 */
export function identifierSuffix(value: string): string {
  return value.trim().slice(-4);
}

/**
 * 纯 CLI 解析：
 * - --config 缺省为包根 devices.json（MASTER_CONFIG 可覆盖）
 * - --artifacts 表示产物根目录；每次仍会在其下建立唯一的时间戳 run 目录
 * - --device / --workflow 必填，杜绝常驻调度器式的隐式选择
 */
export function parseWorkflowTestArgs(argv: string[], context: ParseWorkflowTestContext): ParsedWorkflowTestCli {
  if (argv.includes("--help") || argv.includes("-h")) return { help: true };

  const values = new Map<string, string>();
  const known = new Set(["--config", "--device", "--workflow", "--artifacts"]);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) throw new Error(`不支持的位置参数: ${arg}`);
    const equalAt = arg.indexOf("=");
    const flag = equalAt >= 0 ? arg.slice(0, equalAt) : arg;
    const inline = equalAt >= 0 ? arg.slice(equalAt + 1) : undefined;
    if (!known.has(flag)) throw new Error(`未知参数: ${flag}`);
    if (values.has(flag)) throw new Error(`参数重复: ${flag}`);
    const [value, consumedAt] = requireValue(flag, inline, argv, i);
    values.set(flag, value);
    i = consumedAt;
  }

  const deviceId = values.get("--device")?.trim();
  if (!deviceId) throw new Error("缺少必填参数 --device <设备 id>");
  const workflowValue = values.get("--workflow")?.trim();
  if (!workflowValue) throw new Error("缺少必填参数 --workflow <工作流>");
  if (!WORKFLOW_TEST_NAMES.includes(workflowValue as WorkflowTestName)) {
    throw new Error(`--workflow 非法，应为 ${WORKFLOW_TEST_NAMES.join("|")}`);
  }

  const startedAt = context.now ?? new Date();
  const workflow = workflowValue as WorkflowTestName;
  const runId = `${timestampSegment(startedAt)}-${safePathSegment(deviceId)}-${workflow}`;
  const configValue = values.get("--config") ?? context.env?.MASTER_CONFIG;
  const configPath = configValue ? pathFrom(context.cwd, configValue) : join(context.packageRoot, "devices.json");
  const artifactsRootValue = values.get("--artifacts");
  const artifactsRoot = artifactsRootValue
    ? pathFrom(context.cwd, artifactsRootValue)
    : join(context.packageRoot, "test-artifacts");

  return {
    help: false,
    configPath,
    deviceId,
    workflow,
    artifactsDir: join(artifactsRoot, runId),
    runId,
    startedAt,
  };
}

export function normalizeRunError(error: unknown): WorkflowRunError {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error.stack ? { stack: error.stack } : {}),
    };
  }
  return { name: "Error", message: String(error) };
}

/**
 * 防止显式选择的工作流因配置开关关闭而“正常跳过”，造成假绿。
 * 返回 null 表示可跑，字符串为可直接反馈给操作者的修复提示。
 */
export function workflowReadinessError(workflow: WorkflowTestName, params: unknown): string | null {
  const p = params as {
    searchKeywords?: unknown;
    following?: { moduleEnable?: unknown };
    persHome?: { moduleEnable?: unknown };
  };
  if (workflow === "search" && (!Array.isArray(p.searchKeywords) || p.searchKeywords.length === 0)) {
    return "search 需要至少一个 searchKeywords";
  }
  if (workflow === "followMonitor" && p.following?.moduleEnable !== true) {
    return "followMonitor 需要 following.moduleEnable=true";
  }
  if (workflow === "profileAndDM" && p.persHome?.moduleEnable !== true) {
    return "profileAndDM 需要 persHome.moduleEnable=true";
  }
  return null;
}

export function buildWorkflowRunSummary(input: WorkflowRunSummaryInput): Record<string, unknown> {
  const { options, finishedAt } = input;
  const present = new Set(input.presentFiles);
  const files = ["run.log", "events.jsonl", "summary.json", "before.png", "after.png", "failure.png"].map((name) => ({
    name,
    path: join(options.artifactsDir, name),
    present: name === "summary.json" ? true : present.has(name),
  }));
  return {
    schemaVersion: 1,
    runId: options.runId,
    status: input.status,
    startedAt: options.startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: Math.max(0, finishedAt.getTime() - options.startedAt.getTime()),
    configPath: options.configPath,
    deviceId: options.deviceId,
    workflow: options.workflow,
    artifactsDir: options.artifactsDir,
    ...(input.device ? { device: input.device } : {}),
    ...(input.vlm ? { vlm: input.vlm } : {}),
    ...(input.stats ? { stats: input.stats } : {}),
    ...(input.error ? { error: input.error } : {}),
    artifacts: files,
  };
}
