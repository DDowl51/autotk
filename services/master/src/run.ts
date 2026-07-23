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
import { existsSync, readFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { createFleet, createMemoryStateStore, defaultTodayKey, type FleetDeps, type Perceptor } from "@auto/core";
import { createIosWdaDriver } from "@auto/driver-ios-wda";
import { createOpenAiBackend, createVlmPerceptor } from "@auto/perceptor-vlm";
import { ONCE_PER_DAY, pageHazards, pickWorkflow, publish, tiktokPlugin } from "@auto/plugin-tiktok";
import { mergeDiscoveredEntries, parseConfig, type MasterConfigFile, type ResolvedConfig, type ResolvedDevice } from "./config";
import { isPrivateSubnet, parseSubnetList, scanForWda, subnet24Hosts, subnetOf, type Discovered, type WdaProbe } from "./discovery";
import { createHubClient, type HubClient } from "./hub/hubClient";
import { toDeviceStatus } from "./hub/statusReporter";
import { applyConfigPatch } from "./hub/configInbox";
import { createReceiverHub, type ReceiverHub } from "./receiver/receiverServer";
import { createPublishOrchestrator } from "./publish/orchestrator";
import { loggingDriver } from "./loggingDriver";
import { createDeviceLogSink } from "./deviceLog";

const configHooks = { defaultParams: tiktokPlugin.defaultParams, validateParams: tiktokPlugin.validateParams };

/** VLM 地址缺省:本机 :8000(perception 与 master 同机的常见部署);远端 GPU 设 MASTER_VLM_URL 覆盖。 */
const DEFAULT_VLM_URL = "http://localhost:8000";

/** 读原始配置:有文件读文件;无文件 → 合成最小配置(vlm 用 MASTER_VLM_URL 或默认本机 8000,devices 空靠自动发现填)。 */
function readRawConfig(path: string): MasterConfigFile {
  if (existsSync(path)) {
    try {
      return JSON.parse(readFileSync(path, "utf8")) as MasterConfigFile;
    } catch (e) {
      throw new Error(`读/解析配置 ${path} 失败: ${e instanceof Error ? e.message : e}`);
    }
  }
  const vlm = process.env.MASTER_VLM_URL || DEFAULT_VLM_URL;
  return { vlm: { url: vlm, model: process.env.MASTER_VLM_MODEL }, devices: [] };
}

/** 本机所有非回环 LAN IPv4(可能多张网卡)。 */
function allLanIPv4(): string[] {
  const out: string[] = [];
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const i of ifaces ?? []) if (i.family === "IPv4" && !i.internal) out.push(i.address);
  }
  return out;
}
const hostOf = (url: string): string => url.match(/\/\/([^:/]+)/)?.[1] ?? "";

/**
 * 要扫的子网们:MASTER_SUBNET 显式指定则只扫它;否则取本机各网卡 + VLM 地址所在段里的**私网 /24**
 * (排除 198.18 等 VPN 虚拟网卡段——真机踩过误扫 198.18.0.x)。多张真 LAN 网卡就都扫,谁也不漏。
 */
function resolveSubnets(raw: MasterConfigFile): string[] {
  if (process.env.MASTER_SUBNET) {
    const list = parseSubnetList(process.env.MASTER_SUBNET); // 支持多段(逗号/空格分隔)
    if (list.length) return list;
  }
  const subs = new Set<string>();
  for (const ip of allLanIPv4()) {
    const s = subnetOf(ip);
    if (s && isPrivateSubnet(s)) subs.add(s);
  }
  const vlmSub = subnetOf(hostOf(raw.vlm?.url ?? ""));
  if (vlmSub && isPrivateSubnet(vlmSub)) subs.add(vlmSub);
  return [...subs];
}
/** WDA 探针:连得上并能读到分辨率=手机,否则 null。超时给足(锁屏/慢机建会话可能久)。 */
const discoverProbe: WdaProbe = async (host, port) => {
  try {
    return await createIosWdaDriver(`http://${host}:${port}`, { timeoutMs: 2000 }).windowSize();
  } catch {
    return null;
  }
};
/** 扫一组子网的 :8100,返回发现的手机(初扫与持续重扫共用)。 */
function scanSubnets(subnets: string[], quiet = false): Promise<Discovered[]> {
  const hosts = subnets.flatMap((s) => subnet24Hosts(s));
  return scanForWda(hosts, discoverProbe, {
    concurrency: 64,
    log: quiet ? undefined : (m) => console.log("  " + m),
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
  const raw = readRawConfig(path);
  const discover = process.env.MASTER_DISCOVER === "1";
  const subnets = discover ? resolveSubnets(raw) : [];
  if (discover && subnets.length === 0) {
    console.error("自动发现:未找到本机私网网卡,请设 MASTER_SUBNET=192.168.x 重试");
    process.exit(1);
  }
  if (discover) {
    console.log(`自动发现:扫 ${subnets.map((s) => `${s}.1-254`).join(" / ")} 的 :8100(WDA)…`);
    const found = await scanSubnets(subnets);
    // 稳定状态行：desktop/electron/master-status.cjs 据此更新“发现数/上次扫描时间”。
    console.log(`自动发现:扫描完成,发现 ${found.length} 台`);
    raw.devices = mergeDiscoveredEntries(raw.devices ?? [], found);
    console.log(`自动发现:合并配置后共 ${raw.devices.length} 台`);
  }
  const config = parseConfig(raw, configHooks);
  console.log(`配置 ${path}:${config.devices.length} 台;VLM ${config.vlm.url} (${config.vlm.model})`);

  let hub: HubClient | undefined;
  const deviceLogs = createDeviceLogSink({
    report: (deviceId, line) => hub?.reportLog(deviceId, [line]),
  });

  // —— 感知 + Fleet(设备集**动态**:先建空壳,再逐台 addDevice 上线;持续发现新机自动加入)——
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
    log: (id, m) => deviceLogs.log(id, m),
    onEvent: (id, evt, data) => deviceLogs.event(id, evt, data),
  };
  const fleet = createFleet(deps);

  let stopping = false;
  const activeIds = new Set<string>(); // 已上线设备 id
  const activeHosts = new Set<string>(); // 已上线设备 host(防重扫重复加同一台)
  const deviceState = new Map<string, { params: unknown; schedule: ResolvedDevice["schedule"] }>();
  let reachableIdx = 0;

  // ——— 管理中心对接 + 发布链路(设 HUB_URL 才启用)———
  const hubUrl = process.env.HUB_URL;
  let receiver: ReceiverHub | undefined;
  let statusTimer: ReturnType<typeof setInterval> | undefined;
  if (hubUrl) {
    const receiverPort = Number(process.env.RECEIVER_PORT ?? 4610);
    receiver = createReceiverHub({ port: receiverPort, log: (m) => console.log(m) });
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
    statusTimer = setInterval(() => {
      for (const id of activeIds) {
        const h = fleet.get(id);
        if (h) hub!.reportStatus(id, toDeviceStatus(h, { running: !stopping && !h.isPaused(), ts: Date.now() }));
      }
    }, 5000);
    console.log(`已接管理中心 Hub ${hubUrl};收视频通道 :${receiverPort}`);
  } else {
    console.log("未设 HUB_URL —— 纯养号模式,不接管理中心/发布。");
  }

  // 上线一台:建 driver → 探活(建会话 + 分辨率)→ 装进 Fleet + 注册 Hub。现在不可达 → 返回 false(下轮重扫再试)。
  async function addDevice(rd: ResolvedDevice): Promise<boolean> {
    const host = hostOf(rd.wdaUrl);
    if (activeIds.has(rd.id) || activeHosts.has(host)) return false;
    const drv = loggingDriver(createIosWdaDriver(rd.wdaUrl, { timeoutMs: config.wdaTimeoutMs }), (m) =>
      deviceLogs.log(rd.id, m),
    );
    let size = rd.size;
    try {
      await drv.ensureHealthy();
      if (!size) size = await drv.windowSize();
    } catch {
      return false; // 现在连不上(WDA 没起/网络)→ 交给持续重扫下轮再试
    }
    fleet.add({ id: rd.id, driver: drv, size, params: rd.params, schedule: rd.schedule, phaseOffsetMs: reachableIdx * config.staggerMs });
    reachableIdx++;
    activeIds.add(rd.id);
    activeHosts.add(host);
    deviceState.set(rd.id, { params: rd.params, schedule: rd.schedule });
    hub?.registerDevice({ deviceId: rd.id, deviceName: rd.name });
    console.log(`+ 上线 ${rd.id}(${rd.name}) ${size.width}x${size.height}`);
    return true;
  }

  // 初次上线已知/初扫到的手机
  console.log("上线手机…");
  for (const d of config.devices) await addDevice(d);
  console.log(`已上线 ${activeIds.size} 台(错峰 ${config.staggerMs}ms/台)。`);
  if (activeIds.size === 0 && !discover) {
    console.log("⚠️ 无设备且未开自动发现:设 MASTER_DISCOVER=1,或在配置里填 devices。");
  }

  // 持续发现:定时重扫子网,新上线的手机**即时**加入 Fleet + 注册 Hub(常驻,进程不因 0 台而退)。
  if (discover) {
    const rescanMs = Math.max(5000, Number(process.env.MASTER_RESCAN_MS ?? 20000));
    let rescanRunning = false;
    const rescan = async (): Promise<void> => {
      if (stopping || rescanRunning) return; // 慢扫描不叠跑，避免同一手机被两轮并发装配。
      rescanRunning = true;
      try {
        const found = await scanSubnets(subnets, true);
        for (const f of found) {
          if (activeHosts.has(f.host)) continue;
          try {
            const rd = parseConfig({ ...raw, devices: mergeDiscoveredEntries([], [f]) }, configHooks).devices[0];
            if (await addDevice(rd)) console.log(`🔎 新手机上线并加入:${f.host}`);
          } catch (e) {
            console.log(`发现 ${f.host} 装配失败:${e instanceof Error ? e.message : e}`);
          }
        }
        // 即使 0 台/没有新机也输出，desktop 才能确认这一轮确实完成。
        console.log(`自动发现:重扫完成,发现 ${found.length} 台`);
      } catch (e) {
        console.log(`重扫失败:${e instanceof Error ? e.message : e}`);
      } finally {
        rescanRunning = false;
      }
    };
    setInterval(() => void rescan(), rescanMs);
    console.log(`持续发现:每 ${Math.round(rescanMs / 1000)}s 重扫 ${subnets.map((s) => `${s}.x`).join("/")},新手机自动加入。`);
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
