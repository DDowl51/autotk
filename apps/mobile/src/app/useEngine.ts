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
import { hubEnabled, HUB_CONFIG } from "../hub/config";
import { resolveDeviceName } from "../hub/deviceName";
import { buildStatus } from "../hub/reporter";
import { applyConfigPatch } from "../hub/configInbox";
import type { PublishTaskMsg } from "../hub/protocol";
import { PublishQueue, runPublish } from "../publish/publishQueue";
import { downloadToAlbum } from "../publish/downloader";
import { saveBytesToAlbum } from "../publish/album";
import { resolveDeviceId } from "../license/deviceId";
import { track } from "../telemetry";

type LogLevel = "info" | "warn" | "error";

const MAX_LOGS = 200;

export type EngineMode = "real" | "mock";

export interface EngineState {
  params: AutomationParams;
  setParams: (p: AutomationParams) => void;
  running: boolean;
  mode: EngineMode;
  logs: string[];
  stats: RunStats;
  start: () => void;
  stop: () => void;
  clearLogs: () => void;
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
export function useEngine(): EngineState {
  const [params, setParams] = useState<AutomationParams>(DEFAULT_PARAMS);
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState<EngineMode>("mock");
  const [logs, setLogs] = useState<string[]>([]);
  const [stats, setStats] = useState<RunStats>(emptyStats());

  const engineRef = useRef<Engine | null>(null);
  const uiRef = useRef<TikTokUI | null>(null);
  const hubRef = useRef<HubClient | null>(null);
  // 让 Hub 配置下发回调读到「最新」params（避免一次性 effect 的闭包过期）。
  const paramsRef = useRef(params);
  paramsRef.current = params;

  // 发布任务队列（阶段3）：去重 + 串行处理，避免并发发布。
  const publishQueueRef = useRef(new PublishQueue());
  const drainingRef = useRef(false);
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
    try {
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
    engineRef.current?.stop();
    stopKeepAlive().catch(() => {});
  }, []);

  const start = useCallback(() => {
    if (engineRef.current?.isRunning() || startingRef.current) return;
    startingRef.current = true;

    logBufRef.current = [];
    setLogs([]);
    setStats(emptyStats());

    const launch = async () => {
      try {
        const picked = await makeUI(pushLog);
        uiRef.current = picked.ui;
        setMode(picked.mode);

        // 真机模式:先把后台保活权限处理完（弹窗要在 autotk 仍在前台时弹）,
        // 再启动引擎切到 TikTok,否则切前台会把定位授权弹窗冲掉。
        // 没有保活,App 退后台(TikTok 前台时)~30s 就被 iOS 挂起、自动化中断。
        if (picked.mode === "real") {
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
            pushLog(`后台保活未开启（后台会被挂起）：${e instanceof Error ? e.message : String(e)}`);
          }
        }

        const engine = createEngine({
          params,
          ui: picked.ui,
          gen: createFixedReplyGenerator(params.fixedReplies),
          logger: { log: (lvl, msg) => pushLog(msg, lvl as LogLevel) },
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

  // 接入管理中心 Hub（配置了 EXPO_PUBLIC_HUB_URL 才接）：上报状态 + 日志。
  // 失败不影响 autotk 本体运行；autotk 一打开就在线，引擎跑不跑只改 running 字段。
  useEffect(() => {
    if (!hubEnabled()) return;
    let client: HubClient | null = null;
    let statusTimer: ReturnType<typeof setInterval> | null = null;
    let alive = true;
    void (async () => {
      try {
        const deviceId = await resolveDeviceId();
        if (!alive) return;
        client = new HubClient({
          url: HUB_CONFIG.url,
          deviceId,
          deviceName: resolveDeviceName(),
          version: "autotk",
          onConfigApply: (m) => {
            // 批量配置下发：深合并到最新 params + 校验，整体接受或整体拒绝并回执。
            const res = applyConfigPatch(paramsRef.current, m.patch);
            if (res.ok) {
              setParams(res.next); // 下一轮引擎读到新值
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
            }),
          );
        }, 5000);
      } catch {
        // 忽略：Hub 接入失败不影响主流程
      }
    })();
    return () => {
      alive = false;
      if (statusTimer) clearInterval(statusTimer);
      client?.disconnect();
      hubRef.current = null;
    };
  }, []);

  // 卸载时清理。
  useEffect(() => {
    return () => {
      engineRef.current?.stop();
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  return { params, setParams, running, mode, logs, stats, start, stop, clearLogs };
}
