import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_PARAMS, type AutomationParams } from "../params";
import { createEngine, type Engine, type RunStats } from "../engine";
import { emptyStats } from "../engine/types";
import { createMockUI } from "../engine/mockUI";
import { createFixedReplyGenerator } from "../gen";
import { createRealUI } from "./realUI";
import { startKeepAlive, stopKeepAlive } from "./keepalive";
import type { TikTokUI } from "../engine/tiktok-ui";
import { HubClient } from "../hub/client";
import { HUB_CONFIG, setHubUrl } from "../hub/config";
import { getStoredHubUrl, setStoredHubUrl } from "../hub/hubUrlStore";
import { startHubDiscovery } from "../hub/discovery";
import { candidateUrls, hostOf } from "../hub/hubUrl";
import { probeHub } from "../hub/probe";
import { resolveDeviceName } from "../hub/deviceName";
import { buildStatus, mapBattery } from "../hub/reporter";
import { applyConfigPatch } from "../hub/configInbox";
import { batteryInfo } from "../wda";
import type { PublishTaskMsg, DeviceBattery } from "../hub/protocol";
import { PublishQueue, runPublish } from "../publish/publishQueue";
import { downloadToAlbum } from "../publish/downloader";
import { saveBytesToAlbum } from "../publish/album";
import { resolveDeviceId } from "../license/deviceId";
import { saveParams } from "./paramsStorage";
import { track } from "../telemetry";

type LogLevel = "info" | "warn" | "error";

const MAX_LOGS = 200;

export type EngineMode = "real" | "mock";

export interface EngineState {
  params: AutomationParams;
  setParams: (p: AutomationParams) => void;
  running: boolean;
  /** 已点停止、引擎正在收尾（给按钮即时反馈，避免以为没点到）。 */
  stopping: boolean;
  mode: EngineMode;
  logs: string[];
  stats: RunStats;
  start: () => void;
  stop: () => void;
  clearLogs: () => void;
  /** 是否已连上控制中心（Hub）。 */
  hubConnected: boolean;
  /** 当前控制中心地址（空=未配置）。 */
  hubUrl: string;
  /** 设定控制中心地址（扫码/手动输入调用）：持久化 + 触发重连。 */
  setHubEndpoint: (url: string) => void;
}

/** 真机模式优先（dev build 上有 vision-ocr）；不可用则回退演示模式。 */
async function makeUI(log: (m: string) => void): Promise<{ ui: TikTokUI; mode: EngineMode }> {
  try {
    return { ui: await createRealUI(log), mode: "real" };
  } catch (e) {
    log(`真机模式不可用，用演示模式：${e instanceof Error ? e.message : e}`);
    return { ui: createMockUI(log), mode: "mock" };
  }
}

/**
 * 把决策引擎接到 React。演示模式下用 mock UI/生成器，
 * 因此在真机/Expo Go 上即可跑通整条链路。
 */
export function useEngine(initialParams?: AutomationParams): EngineState {
  const [params, setParams] = useState<AutomationParams>(initialParams ?? DEFAULT_PARAMS);
  const [running, setRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [mode, setMode] = useState<EngineMode>("mock");
  const [logs, setLogs] = useState<string[]>([]);
  const [stats, setStats] = useState<RunStats>(emptyStats());
  // 控制中心连接：地址（扫码/自动发现/持久化/env 默认）+ 是否已连上。
  const [hubUrl, setHubUrlState] = useState<string>(HUB_CONFIG.url);
  const [hubConnected, setHubConnected] = useState(false);
  const hubUrlRef = useRef(hubUrl);
  hubUrlRef.current = hubUrl;

  const engineRef = useRef<Engine | null>(null);
  const uiRef = useRef<TikTokUI | null>(null);
  const hubRef = useRef<HubClient | null>(null);
  // 最近一次读到的电量（每 ~60s 刷新，随状态一起上报）；读不到时为 undefined、上报省略。
  const batteryRef = useRef<DeviceBattery | undefined>(undefined);
  // 让 Hub 配置下发回调读到「最新」params（避免一次性 effect 的闭包过期）。
  const paramsRef = useRef(params);
  paramsRef.current = params;

  // 发布任务队列（阶段3）：去重 + 串行处理，避免并发发布。
  const publishQueueRef = useRef(new PublishQueue());
  const drainingRef = useRef(false);
  // 发布正在驱动 WDA（占用手机前台）→ 养号暂停。引擎 isPaused 读它；发布期间置 true。
  const publishingRef = useRef(false);
  const logBufRef = useRef<string[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // 同步防重入：engineRef/running 要等 await startKeepAlive 之后才设置，
  // 这段空窗期间不能让第二次 start() 再起一个引擎。
  const startingRef = useRef(false);

  const pushLog = useCallback((msg: string, level: LogLevel = "info") => {
    const line = `${new Date().toLocaleTimeString()}  ${msg}`;
    const buf = logBufRef.current;
    buf.push(line);
    if (buf.length > MAX_LOGS) buf.splice(0, buf.length - MAX_LOGS);
    hubRef.current?.log({ level, msg, ts: Date.now() }); // 旁路一份给管理中心
  }, []);

  // 串行处理发布队列：一条接一条下载入相册 + 发布，逐步回报 Hub。
  const drainPublishQueue = useCallback(async () => {
    if (drainingRef.current) return;
    drainingRef.current = true;
    // 占用 WDA：养号暂停开新批次（isPaused），并等它当前批次跑完（isBusy）再发布，
    // 保证养号与发布对同一手机完全串行、绝不并发驱动。
    publishingRef.current = true;
    try {
      while (engineRef.current?.isBusy()) await new Promise((r) => setTimeout(r, 400));
      let item = publishQueueRef.current.nextPending();
      while (item) {
        const task = item.task;
        await runPublish(task, {
          download: (t) =>
            downloadToAlbum(t.source, t.videoName, {
              fetch: (u) => fetch(u),
              saveToAlbum: saveBytesToAlbum,
            }),
          publishVideo: async (assetUri, caption) => {
            const pv = uiRef.current?.publishVideo;
            if (!pv) throw new Error("本机未适配发布功能（机型适配阶段接入）");
            await pv(assetUri, caption);
          },
          onStatus: (status, error) => {
            publishQueueRef.current.setStatus(task.taskId, status, error);
            if (status === "published" || status === "failed") track("publish_result", { status });
            pushLog(
              error ? `发布 ${task.videoName}：${status}（${error}）` : `发布 ${task.videoName}：${status}`,
              status === "failed" ? "error" : "info",
            );
            hubRef.current?.reportPublishResult(task.taskId, status, error);
          },
        });
        item = publishQueueRef.current.nextPending();
      }
    } finally {
      drainingRef.current = false;
      publishingRef.current = false; // 发布队列清空 → 养号恢复
    }
  }, [pushLog]);

  const handlePublishTask = useCallback(
    (m: PublishTaskMsg) => {
      if (!publishQueueRef.current.enqueue(m)) return; // 重复任务忽略
      pushLog(`收到发布任务：${m.videoName}`);
      void drainPublishQueue();
    },
    [drainPublishQueue, pushLog],
  );

  const stop = useCallback(() => {
    track("engine_stop");
    setStopping(true); // 即时反馈：引擎收尾要点时间，先把按钮变「停止中…」，别让用户以为没点到
    engineRef.current?.stop();
    stopKeepAlive().catch(() => {});
  }, []);

  const start = useCallback(() => {
    if (engineRef.current?.isRunning() || startingRef.current) return;
    startingRef.current = true;

    logBufRef.current = [];
    setLogs([]);
    setStats(emptyStats());
    setStopping(false);

    const launch = async () => {
      try {
        // 后台保活必须在 **makeUI 之前** 起：makeUI 里的首跑标定会 activateApp(TikTok) 把 autotk
        // 顶到后台；若那之前没起保活，autotk 一退后台 JS 就被 iOS 挂起（~30s），引擎起不来/中断、
        // 日志停同步——正是真机所见「点启动跳 TikTok 后要手动切回等引擎起」。请求「始终」定位的弹窗
        // 也必须在 autotk 仍前台时弹。故顺序：先保活 → 再 makeUI 切 TikTok。
        // （Expo Go/未编入原生模块时这里抛「找不到模块」→ 属预期，正式 dev build 才有此能力。）
        try {
          const ka = await startKeepAlive();
          if (ka.always) {
            pushLog("后台保活已开启（始终定位）");
          } else {
            pushLog(
              "保活未生效：定位仅「使用App时」。请到 设置→隐私与安全性→定位服务→autotk 改为「始终」,再重新启动。",
            );
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          if (/native module|KeepAlive/i.test(msg)) {
            pushLog("后台保活模块未编入（当前为 Expo Go/测试包，正式 dev build 才生效）——后台会被挂起、日志只在前台同步");
          } else {
            pushLog(`后台保活未开启（后台会被挂起）：${msg}`);
          }
        }

        const picked = await makeUI(pushLog);
        uiRef.current = picked.ui;
        setMode(picked.mode);

        const engine = createEngine({
          params,
          ui: picked.ui,
          gen: createFixedReplyGenerator(params.fixedReplies),
          logger: { log: (lvl, msg) => pushLog(msg, lvl as LogLevel) },
          // 发布占用手机时暂停养号（与发布串行，不抢前台）。
          isPaused: () => publishingRef.current,
        });
        engineRef.current = engine;
        setRunning(true);
        track("engine_start", { mode: picked.mode });

        // 实时刷新日志与统计。
        pollRef.current = setInterval(() => {
          setLogs([...logBufRef.current]);
          setStats(engine.getStats());
          if (!engine.isRunning()) {
            setRunning(false);
            setStopping(false);
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }, 300);

        engine.start().catch((e: unknown) => {
          pushLog(`错误：${e instanceof Error ? e.message : String(e)}`);
        });
      } finally {
        // 引擎已建立（isRunning 接管防重入）或出错回退，都解除同步锁。
        startingRef.current = false;
      }
    };

    void launch();
  }, [params, pushLog]);

  const clearLogs = useCallback(() => {
    logBufRef.current = [];
    setLogs([]);
  }, []);

  // 设置变更即持久化（防抖 400ms）；跳过首帧（首帧就是加载好的值，无需回写）。
  const savedOnceRef = useRef(false);
  useEffect(() => {
    if (!savedOnceRef.current) {
      savedOnceRef.current = true;
      return;
    }
    const h = setTimeout(() => void saveParams(params), 400);
    return () => clearTimeout(h);
  }, [params]);

  // 参数变化（本地改设置 / 下发合并）→ 若引擎在跑，热更到运行中的引擎，即时生效。
  useEffect(() => {
    engineRef.current?.updateParams(params, createFixedReplyGenerator(params.fixedReplies));
  }, [params]);

  // 设定控制中心地址：写 config + 持久化 + 触发重连（下方 hub 连接 effect 依赖 hubUrl）。
  const setHubEndpoint = useCallback((url: string) => {
    const u = (url || "").trim();
    if (!u) return;
    setHubUrl(u);
    void setStoredHubUrl(u);
    setHubUrlState(u);
  }, []);

  // 挂载：载入上次记住的地址 + 启动局域网自动发现（都失败也不影响本机运行）。
  useEffect(() => {
    void getStoredHubUrl().then((stored) => {
      if (stored) setHubEndpoint(stored);
    });
    let disc: { stop(): void } | null = null;
    try {
      disc = startHubDiscovery((url) => {
        if (!hubUrlRef.current) setHubEndpoint(url); // 还没地址时才采用自动发现到的
      });
    } catch {
      // 自动发现不可用（无原生模块/权限）→ 靠扫码或手填
    }
    return () => disc?.stop();
  }, [setHubEndpoint]);

  // 接入管理中心 Hub（有地址才接，地址变则重连）：上报状态 + 日志。
  // 失败不影响 autotk 本体运行；autotk 一打开就在线，引擎跑不跑只改 running 字段。
  useEffect(() => {
    if (!hubUrl) return;
    let client: HubClient | null = null;
    let statusTimer: ReturnType<typeof setInterval> | null = null;
    let batteryTimer: ReturnType<typeof setInterval> | null = null;
    let alive = true;

    // 每 ~60s 读一次设备电量（需 WDA session；读不到就保持上次/清空，静默）。
    const refreshBattery = async () => {
      try {
        batteryRef.current = mapBattery(await batteryInfo());
      } catch {
        batteryRef.current = undefined; // 无 session / 演示模式 / 读取失败 → 不上报电量
      }
    };
    void (async () => {
      try {
        const deviceId = await resolveDeviceId();
        if (!alive) return;
        client = new HubClient({
          url: hubUrl,
          deviceId,
          deviceName: resolveDeviceName(),
          version: "autotk",
          onConnectionChange: (c) => setHubConnected(c),
          onConfigApply: (m) => {
            // 批量配置下发：深合并到最新 params + 校验，整体接受或整体拒绝并回执。
            const res = applyConfigPatch(paramsRef.current, m.patch);
            if (res.ok) {
              // 同步推进 ref：背靠背连续下发时，第二条也基于「已并入第一条」的最新值再合并，
              // 不会因 setParams 是异步、ref 要下次渲染才刷新而丢掉前一条更新。
              paramsRef.current = res.next;
              setParams(res.next);
              // 关键：同步热更到「正在运行的引擎」，真生效后再回 ok；
              // 否则运行中的引擎读的是旧闭包，下发静默失灵还伪报成功（审计 critical）。
              engineRef.current?.updateParams(res.next, createFixedReplyGenerator(res.next.fixedReplies));
              pushLog(`已应用下发配置（任务 ${m.jobId}）`);
              hubRef.current?.reportConfigResult(m.jobId, true);
            } else {
              pushLog(`下发配置被拒绝：${res.error}`, "warn");
              hubRef.current?.reportConfigResult(m.jobId, false, res.error);
            }
          },
          onPublishTask: handlePublishTask,
        });
        client.connect();
        hubRef.current = client;
        void refreshBattery();
        batteryTimer = setInterval(() => void refreshBattery(), 60000);
        statusTimer = setInterval(() => {
          const eng = engineRef.current;
          const st = eng?.getStats();
          client!.reportStatus(
            buildStatus({
              running: eng?.isRunning() ?? false,
              module: eng?.getModule(),
              page: uiRef.current?.getPage?.(),
              stats: st
                ? { likes: st.likes, follows: st.follows, comments: st.commentReplies, videos: st.videosWatched }
                : undefined,
              alert: null,
              battery: batteryRef.current,
            }),
          );
        }, 5000);
      } catch (e) {
        // Hub 接入失败不影响主流程，但记一条日志（不再静默）。
        pushLog(`控制中心接入失败（本机仍可运行）：${e instanceof Error ? e.message : String(e)}`, "warn");
      }
    })();
    return () => {
      alive = false;
      if (statusTimer) clearInterval(statusTimer);
      if (batteryTimer) clearInterval(batteryTimer);
      client?.disconnect();
      hubRef.current = null;
      setHubConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hubUrl]);

  // 端口兜底重连（第三层）：连不上、但有「已知 IP」（之前连过）时，按共享端口表在该 IP 上
  // 逐个探测，命中就切过去。补「UDP 广播被防火墙拦 + Hub 端口变化」导致的重连不上。
  useEffect(() => {
    if (hubConnected) return; // 已连上不扫
    const host = hostOf(hubUrlRef.current);
    if (!host) return; // 没连过、没有已知 IP → 靠扫码 / 自动发现
    let alive = true;
    let running = false;
    const sweep = async () => {
      if (running || !alive || hubRef.current?.isConnected()) return;
      running = true;
      try {
        for (const u of candidateUrls(host)) {
          if (!alive || hubRef.current?.isConnected()) return;
          if (u === hubUrlRef.current.replace(/\/$/, "")) continue; // 当前正在试的跳过
          if (await probeHub(u)) {
            if (alive && !hubRef.current?.isConnected()) setHubEndpoint(u);
            return;
          }
        }
      } finally {
        running = false;
      }
    };
    const timer = setInterval(() => void sweep(), 15000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [hubConnected, setHubEndpoint]);

  // 卸载时清理。
  useEffect(() => {
    return () => {
      engineRef.current?.stop();
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  return {
    params,
    setParams,
    running,
    stopping,
    mode,
    logs,
    stats,
    start,
    stop,
    clearLogs,
    hubConnected,
    hubUrl,
    setHubEndpoint,
  };
}
