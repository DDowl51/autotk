import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_PARAMS, type AutomationParams } from "../params";
import { createEngine, type Engine, type RunStats } from "../engine";
import { emptyStats } from "../engine/types";
import { createMockUI, createMockGenerator } from "../engine/mockUI";
import { createRealUI } from "./realUI";
import type { TikTokUI } from "../engine/tiktok-ui";

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
function makeUI(log: (m: string) => void): { ui: TikTokUI; mode: EngineMode } {
  try {
    return { ui: createRealUI(log), mode: "real" };
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
  const logBufRef = useRef<string[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pushLog = useCallback((msg: string) => {
    const line = `${new Date().toLocaleTimeString()}  ${msg}`;
    const buf = logBufRef.current;
    buf.push(line);
    if (buf.length > MAX_LOGS) buf.splice(0, buf.length - MAX_LOGS);
  }, []);

  const stop = useCallback(() => {
    engineRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    if (engineRef.current?.isRunning()) return;

    logBufRef.current = [];
    setLogs([]);
    setStats(emptyStats());

    const picked = makeUI(pushLog);
    setMode(picked.mode);
    const engine = createEngine({
      params,
      ui: picked.ui,
      gen: createMockGenerator(),
      logger: { log: (_lvl, msg) => pushLog(msg) },
    });
    engineRef.current = engine;
    setRunning(true);

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
  }, [params, pushLog]);

  const clearLogs = useCallback(() => {
    logBufRef.current = [];
    setLogs([]);
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
