// master 多机运行时(T5,决策记录 2026-07-20):读配置表 → 拼 N 台 driver → 启动探活 →
// 装配 Fleet(共享 perceptor + StateStore + tiktok 插件)→ 起主循环 → Ctrl-C 优雅停。
// 这是命令式外壳(接真时钟/IO/网络,不单测);纯逻辑在 config/probe/assemble(有测)。
//
// 用法:
//   MASTER_CONFIG=./devices.json pnpm --filter @mc/master start     # 或把路径作首个参数
// 前置:GPU perception 服务起着;各手机 WDA 跑着 + TikTok 已登录;配置表 IP 为 DHCP 静态租约。
//
// Hub 对接(D3=A 平铺)+ 发布链路已接,设 HUB_URL 才启用(不设=纯养号模式)。
// ⚠️ 尚未接:Postgres StateStore(DM 去重跨重启,剩余工作)、License(D4 MVP 不接)。
import { readFileSync } from "node:fs";
import {
  createFleet,
  createMemoryStateStore,
  defaultTodayKey,
  type Driver,
  type FleetDeps,
  type Perceptor,
} from "@auto/core";
import { createIosWdaDriver } from "@auto/driver-ios-wda";
import { createOpenAiBackend, createVlmPerceptor } from "@auto/perceptor-vlm";
import { ONCE_PER_DAY, pageHazards, pickWorkflow, publish, tiktokPlugin } from "@auto/plugin-tiktok";
import { parseConfig, type ResolvedConfig } from "./config";
import { probeAll, summarize, type ProbeOne } from "./probe";
import { buildPhoneConfigs } from "./assemble";
import { createHubClient, type HubClient } from "./hub/hubClient";
import { toDeviceStatus } from "./hub/statusReporter";
import { applyConfigPatch } from "./hub/configInbox";
import { createReceiverHub, type ReceiverHub } from "./receiver/receiverServer";
import { createPublishOrchestrator } from "./publish/orchestrator";

function loadConfig(path: string): ResolvedConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    throw new Error(`读/解析配置 ${path} 失败: ${e instanceof Error ? e.message : e}`);
  }
  return parseConfig(raw, {
    defaultParams: tiktokPlugin.defaultParams,
    validateParams: tiktokPlugin.validateParams,
  });
}

function buildPerceptor(vlm: ResolvedConfig["vlm"]): Perceptor {
  return createVlmPerceptor({
    backend: createOpenAiBackend({ baseUrl: vlm.url, model: vlm.model, timeoutMs: vlm.timeoutMs }),
  });
}

/** 设备本地「当天秒数」(master 与手机同局域网/时区)。 */
function daySeconds(): number {
  const d = new Date();
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
}
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, Math.max(0, ms)));

async function main(): Promise<void> {
  const path = process.argv[2] ?? process.env.MASTER_CONFIG ?? "devices.json";
  const config = loadConfig(path);
  console.log(`配置 ${path}:${config.devices.length} 台;VLM ${config.vlm.url} (${config.vlm.model})`);

  // 一台一 driver(探活与运行共用同一 session,避免重复建会话)。
  const drivers = new Map<string, Driver>();
  for (const d of config.devices) drivers.set(d.id, createIosWdaDriver(d.wdaUrl, { timeoutMs: config.wdaTimeoutMs }));

  // 启动探活:建会话 + 读分辨率;不可达即报,不静默。
  const probeOne: ProbeOne = async (d) => {
    const drv = drivers.get(d.id)!;
    await drv.ensureHealthy();
    const size = await drv.windowSize();
    return { ok: true, size, detail: `${size.width}x${size.height}` };
  };
  console.log("启动探活…");
  const outcomes = await probeAll(config.devices, probeOne, { log: (m) => console.log("  " + m) });
  const { reachable, unreachable } = summarize(outcomes);
  console.log(`探活:${reachable} 可达 / ${unreachable} 不可达`);

  const { configs, skipped } = buildPhoneConfigs(config, outcomes, (id) => drivers.get(id)!);
  if (skipped.length) console.log(`跳过 ${skipped.length} 台:${skipped.map((s) => `${s.id}(${s.reason})`).join(", ")}`);
  if (configs.length === 0) {
    console.error("没有可用手机,退出。");
    process.exit(1);
  }

  const deps: FleetDeps = {
    plugin: tiktokPlugin,
    pickWorkflow,
    oncePerDay: ONCE_PER_DAY,
    recoverWorkflow: "recoverToFeed",
    perceptor: buildPerceptor(config.vlm),
    state: createMemoryStateStore(), // TODO(剩余工作):换 Postgres StateStore —— DM 去重/限量跨重启持久化
    now: () => Date.now(),
    daySeconds,
    todayKey: () => defaultTodayKey(),
    sleep,
    log: (id, m) => console.log(`[${id}] ${m}`),
    onEvent: (id, evt, data) => console.log(`[${id}] «${evt}»`, data ?? ""),
  };
  const fleet = createFleet(deps);
  for (const c of configs) fleet.add(c);
  console.log(`已启动 ${configs.length} 台(错峰 ${config.staggerMs}ms/台)。`);

  let stopping = false;

  // ——— 管理中心对接 + 发布链路(设 HUB_URL 才启用)———
  const hubUrl = process.env.HUB_URL;
  let hub: HubClient | undefined;
  let receiver: ReceiverHub | undefined;
  let statusTimer: ReturnType<typeof setInterval> | undefined;
  if (hubUrl) {
    const receiverPort = Number(process.env.RECEIVER_PORT ?? 4610);
    receiver = createReceiverHub({ port: receiverPort, log: (m) => console.log(m) });
    // 每台当前 params/schedule(config:apply 深合并的基线,热更后更新)。
    const deviceState = new Map(configs.map((c) => [c.id, { params: c.params, schedule: c.schedule }]));
    const orch = createPublishOrchestrator({
      receiver,
      getHandle: (id) => fleet.get(id),
      publishFn: (ctx, input) => publish(ctx, input, pageHazards("publish"), pageHazards("feed")),
      report: (deviceId, taskId, status, error) => hub?.reportPublishResult(deviceId, taskId, status, error),
      sleep,
    });
    hub = createHubClient({
      hubUrl,
      onConfigApply: async (deviceId, patch) => {
        const handle = fleet.get(deviceId);
        const cur = deviceState.get(deviceId);
        if (!handle || !cur) return { ok: false, error: `无此设备: ${deviceId}` };
        try {
          const applied = applyConfigPatch(cur.params, cur.schedule, patch);
          if (applied.params !== undefined) {
            handle.updateParams(applied.params); // 校验失败抛错 → 回 {ok:false}
            cur.params = applied.params;
          }
          if (applied.schedule !== undefined) {
            handle.updateSchedule(applied.schedule);
            cur.schedule = applied.schedule;
          }
          return { ok: true };
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : String(e) };
        }
      },
      onPublishTask: (deviceId, task) => void orch.handlePublishTask(deviceId, task),
      onDeviceControl: (deviceId, action) => {
        const h = fleet.get(deviceId);
        if (!h) return;
        if (action === "pause") h.pause();
        else h.resume();
        console.log(`[${deviceId}] 远程${action === "pause" ? "暂停" : "恢复"}`);
      },
      log: (m) => console.log(m),
    });
    const nameOf = new Map(config.devices.map((d) => [d.id, d.name]));
    for (const c of configs) hub.registerDevice({ deviceId: c.id, deviceName: nameOf.get(c.id) ?? c.id });
    statusTimer = setInterval(() => {
      for (const c of configs) {
        const h = fleet.get(c.id);
        if (h) hub!.reportStatus(c.id, toDeviceStatus(h, { running: !stopping && !h.isPaused(), ts: Date.now() }));
      }
    }, 5000);
    console.log(`已接管理中心 Hub ${hubUrl};收视频通道 :${receiverPort}`);
  } else {
    console.log("未设 HUB_URL —— 纯养号模式,不接管理中心/发布。");
  }
  console.log("Ctrl-C 优雅停止。");

  const shutdown = async (sig: string): Promise<void> => {
    if (stopping) return;
    stopping = true;
    console.log(`\n收到 ${sig},停止所有手机(等当前批跑完)…`);
    if (statusTimer) clearInterval(statusTimer);
    await fleet.stopAll();
    await hub?.close();
    await receiver?.close();
    console.log("已全部退出。");
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((e) => {
  console.error("master 启动失败:", e instanceof Error ? e.message : e);
  process.exit(1);
});
