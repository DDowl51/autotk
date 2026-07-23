// 一次性真机工作流测试：
// 读生产配置 → 只装配指定设备 → 健康检查/切 TikTok → recoverToFeed → 目标工作流 → 退出。
// 与常驻 run.ts 共用 core/plugin/driver/perceptor 生产实现，但不进入 Fleet 无限调度循环。
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  createMemoryStateStore,
  emptyStats,
  runWorkflow,
  toRegistry,
  type Driver,
  type Plugin,
  type RunContext,
  type RunStats,
  type Size,
  type StepResult,
} from "@auto/core";
import { createIosWdaDriver } from "@auto/driver-ios-wda";
import { createOpenAiBackend, createVlmPerceptor } from "@auto/perceptor-vlm";
import { tiktokPlugin } from "@auto/plugin-tiktok";
import { parseConfig, type MasterConfigFile, type ResolvedDevice } from "./config";
import { loggingDriver } from "./loggingDriver";
import {
  buildWorkflowRunSummary,
  identifierSuffix,
  normalizeRunError,
  parseWorkflowTestArgs,
  workflowReadinessError,
  type WorkflowTestName,
  type WorkflowTestOptions,
} from "./workflow-test-cli";

const PACKAGE_ROOT = fileURLToPath(new URL("../", import.meta.url));
const configHooks = { defaultParams: tiktokPlugin.defaultParams, validateParams: tiktokPlugin.validateParams };

const USAGE = `一次性真机工作流测试

用法:
  pnpm --filter @mc/master workflow:test -- \\
    --config ./devices.json \\
    --device 01 \\
    --workflow search \\
    [--artifacts ./test-artifacts]

参数:
  --config      master 配置文件；缺省 services/master/devices.json（也读 MASTER_CONFIG）
  --device      devices[].id，只运行这一台
  --workflow    search | followMonitor | profileAndDM
  --artifacts   产物根目录；缺省 services/master/test-artifacts
`;

interface Recorder {
  log(message: string, level?: "INFO" | "WARN" | "ERROR"): void;
  event(type: string, data?: unknown): void;
  presentFiles: Set<string>;
}

function printable(value: unknown): string {
  if (value === undefined) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function createRecorder(options: WorkflowTestOptions): Recorder {
  mkdirSync(options.artifactsDir, { recursive: true });
  const runLog = `${options.artifactsDir}/run.log`;
  const events = `${options.artifactsDir}/events.jsonl`;
  writeFileSync(runLog, "", { flag: "wx" });
  writeFileSync(events, "", { flag: "wx" });
  const presentFiles = new Set(["run.log", "events.jsonl"]);

  return {
    presentFiles,
    log(message, level = "INFO") {
      const line = `${new Date().toISOString()} [${level}] ${message}`;
      appendFileSync(runLog, `${line}\n`);
      const out = level === "ERROR" ? console.error : level === "WARN" ? console.warn : console.log;
      out(line);
    },
    event(type, data) {
      const row = {
        ts: new Date().toISOString(),
        type,
        ...(data === undefined ? {} : { data }),
      };
      try {
        appendFileSync(events, `${JSON.stringify(row)}\n`);
      } catch {
        appendFileSync(events, `${JSON.stringify({ ts: row.ts, type, data: printable(data) })}\n`);
      }
    },
  };
}

function readConfig(path: string): MasterConfigFile {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as MasterConfigFile;
  } catch (error) {
    throw new Error(`读/解析配置 ${path} 失败: ${normalizeRunError(error).message}`);
  }
}

function selectedDevice(config: ReturnType<typeof parseConfig>, id: string): ResolvedDevice {
  const device = config.devices.find((entry) => entry.id === id);
  if (device) return device;
  throw new Error(`配置中没有设备 id=${id}；可选: ${config.devices.map((entry) => entry.id).join(", ") || "(空)"}`);
}

function instrumentWorkflow(
  workflow: WorkflowTestName,
  recorder: Recorder,
  nonOkSteps: { intent: string; result: StepResult }[],
): Plugin {
  const original = tiktokPlugin.workflows[workflow];
  return {
    ...tiktokPlugin,
    workflows: {
      ...tiktokPlugin.workflows,
      [workflow]: async (ctx: RunContext): Promise<void> => {
        const instrumented: RunContext = {
          ...ctx,
          runStep: async (step) => {
            recorder.event("step_started", { workflow, intent: step.intent });
            try {
              const result = await ctx.runStep(step);
              recorder.event("step_finished", { workflow, intent: step.intent, result });
              if (result.status !== "ok") nonOkSteps.push({ intent: step.intent, result });
              return result;
            } catch (error) {
              recorder.event("step_failed", {
                workflow,
                intent: step.intent,
                error: normalizeRunError(error),
              });
              throw error;
            }
          },
        };
        await original(instrumented);
      },
    },
  };
}

async function saveScreenshot(
  driver: Driver,
  options: WorkflowTestOptions,
  recorder: Recorder,
  name: "before.png" | "after.png" | "failure.png",
): Promise<void> {
  const image = await driver.screenshot();
  writeFileSync(`${options.artifactsDir}/${name}`, image);
  recorder.presentFiles.add(name);
  recorder.event("screenshot_saved", { name, bytes: image.byteLength });
  recorder.log(`截图已保存: ${name} (${image.byteLength} bytes)`);
}

async function runOnce(options: WorkflowTestOptions): Promise<number> {
  const recorder = createRecorder(options);
  const stats: RunStats = emptyStats();
  let driver: Driver | undefined;
  let device: ResolvedDevice | undefined;
  let size: Size | undefined;
  let vlm: { url: string; model: string } | undefined;
  let runError: ReturnType<typeof normalizeRunError> | undefined;
  let interruptedBy: NodeJS.Signals | undefined;

  const onInterrupt = (signal: NodeJS.Signals): void => {
    interruptedBy = signal;
    recorder.log(`收到 ${signal}，将在最近的工作流检查点结束并写出产物`, "WARN");
    recorder.event("interrupt_requested", { signal });
  };
  const onSigint = (): void => onInterrupt("SIGINT");
  const onSigterm = (): void => onInterrupt("SIGTERM");
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);

  recorder.log(`runId=${options.runId}`);
  recorder.log(`配置=${options.configPath}`);
  recorder.log(`设备=${options.deviceId} 工作流=${options.workflow}`);
  recorder.log(`产物=${options.artifactsDir}`);
  recorder.event("run_started", {
    runId: options.runId,
    configPath: options.configPath,
    deviceId: options.deviceId,
    workflow: options.workflow,
  });

  try {
    const config = parseConfig(readConfig(options.configPath), configHooks);
    device = selectedDevice(config, options.deviceId);
    vlm = { url: config.vlm.url, model: config.vlm.model };
    const readiness = workflowReadinessError(options.workflow, device.params);
    if (readiness) throw new Error(`工作流配置未就绪: ${readiness}`);

    driver = loggingDriver(
      createIosWdaDriver(device.wdaUrl, { timeoutMs: config.wdaTimeoutMs }),
      (message) => recorder.log(`[${device!.id}] ${message}`),
    );
    recorder.log(`WDA=${device.wdaUrl} VLM=${config.vlm.url} (${config.vlm.model})`);
    await driver.ensureHealthy();
    await driver.activateApp(tiktokPlugin.appId);
    size = device.size ?? (await driver.windowSize());
    recorder.event("device_ready", { id: device.id, wdaUrl: device.wdaUrl, size });
    recorder.log(`设备就绪: ${device.id} ${size.width}x${size.height}`);
    await saveScreenshot(driver, options, recorder, "before.png");

    const perceptor = createVlmPerceptor({
      backend: createOpenAiBackend({
        baseUrl: config.vlm.url,
        model: config.vlm.model,
        timeoutMs: config.vlm.timeoutMs,
      }),
    });
    const sharedDeps = {
      driver,
      perceptor,
      targets: toRegistry(tiktokPlugin.targets),
      size,
      now: () => Date.now(),
      sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, ms))),
      shouldStop: () => interruptedBy !== undefined,
      log: (message: string) => recorder.log(`[${device!.id}] ${message}`),
      onEvent: (event: string, data?: unknown) =>
        recorder.event("engine_event", { deviceId: device!.id, event, data }),
      params: device.params,
      state: createMemoryStateStore(),
      withinWindow: () => true,
      stats,
    };

    recorder.event("workflow_started", { workflow: "recoverToFeed" });
    recorder.log("开始生产前置复位: recoverToFeed");
    await runWorkflow(tiktokPlugin, "recoverToFeed", sharedDeps);
    recorder.event("workflow_finished", { workflow: "recoverToFeed" });
    if (interruptedBy) throw new Error(`运行被 ${interruptedBy} 中止`);

    const nonOkSteps: { intent: string; result: StepResult }[] = [];
    const instrumentedPlugin = instrumentWorkflow(options.workflow, recorder, nonOkSteps);
    recorder.event("workflow_started", { workflow: options.workflow });
    recorder.log(`开始目标工作流: ${options.workflow}`);
    await runWorkflow(instrumentedPlugin, options.workflow, sharedDeps);
    recorder.event("workflow_finished", { workflow: options.workflow });
    if (interruptedBy) throw new Error(`运行被 ${interruptedBy} 中止`);
    if (nonOkSteps.length > 0) {
      const first = nonOkSteps[0];
      throw new Error(
        `工作流有 ${nonOkSteps.length} 个步骤未成功；首个: ${first.intent} (${first.result.status})`,
      );
    }

    await saveScreenshot(driver, options, recorder, "after.png");
    recorder.log(`工作流完成: ${options.workflow}`);
  } catch (error) {
    runError = normalizeRunError(error);
    recorder.log(`运行失败: ${runError.message}`, "ERROR");
    recorder.event("run_failed", { error: runError });
    if (driver) {
      try {
        await saveScreenshot(driver, options, recorder, "failure.png");
      } catch (shotError) {
        recorder.log(`保存 failure.png 失败: ${normalizeRunError(shotError).message}`, "WARN");
      }
      if (!recorder.presentFiles.has("after.png")) {
        try {
          await saveScreenshot(driver, options, recorder, "after.png");
        } catch (shotError) {
          recorder.log(`保存 after.png 失败: ${normalizeRunError(shotError).message}`, "WARN");
        }
      }
    }
  } finally {
    process.off("SIGINT", onSigint);
    process.off("SIGTERM", onSigterm);
  }

  const finishedAt = new Date();
  const status = runError ? "failed" : "success";
  recorder.event("run_finished", { status, finishedAt: finishedAt.toISOString(), stats });
  const summary = buildWorkflowRunSummary({
    options,
    finishedAt,
    status,
    ...(device
      ? {
          device: {
            id: device.id,
            name: device.name,
            udidSuffix: identifierSuffix(device.udid),
            wdaUrl: device.wdaUrl,
            ...(size ? { size } : {}),
          },
        }
      : {}),
    ...(vlm ? { vlm } : {}),
    stats,
    ...(runError ? { error: runError } : {}),
    presentFiles: [...recorder.presentFiles],
  });
  writeFileSync(`${options.artifactsDir}/summary.json`, `${JSON.stringify(summary, null, 2)}\n`);
  recorder.presentFiles.add("summary.json");
  recorder.log(`摘要已保存: summary.json (${status})`);
  return runError ? 1 : 0;
}

async function main(): Promise<number> {
  try {
    const parsed = parseWorkflowTestArgs(process.argv.slice(2), {
      cwd: process.cwd(),
      packageRoot: PACKAGE_ROOT,
      env: process.env,
    });
    if (parsed.help) {
      console.log(USAGE);
      return 0;
    }
    return await runOnce(parsed);
  } catch (error) {
    console.error(`参数错误: ${normalizeRunError(error).message}\n\n${USAGE}`);
    return 2;
  }
}

void main().then((code) => {
  process.exitCode = code;
});
