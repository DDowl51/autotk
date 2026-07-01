import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Socket } from "socket.io-client";
import type { DeviceInfo, DeviceLogMsg, ConfigPatch, PublishTask } from "@mc/shared";
import { connectHub, watchLogs, pushConfig, enqueuePublish, renameDevice } from "./hub";
import { getPublisherApi } from "./publish-ipc";
import { getHubApi } from "./hub-ipc";
import { addRename, loadRenames, saveRenames, type RenameOp } from "./renameHistory";
import { track } from "./telemetry";
import { startJob, applyProgress, summarizeJob, type JobState } from "./configJobs";
import { startPublish, applyPublishProgress, type PublishMap } from "./publishState";
import {
  addOp,
  updateOpResult,
  describePatchGroups,
  loadHistory,
  saveHistory,
  type ConfigOp,
} from "./configHistory";
import {
  applySnapshot,
  applyUpdate,
  toSorted,
  summarize,
  pushSample,
  type DeviceMap,
  type Summary,
  type SamplePoint,
} from "./devices";
import { applyLogs, clearLogs, getLogs, type LogMap } from "./logs";
import { loadSettings, saveSettings } from "./settings";

interface HubContextValue {
  connected: boolean;
  /** 是否运行在桌面应用内（内嵌 Hub，自动连本机；浏览器预览为 false）。 */
  embedded: boolean;
  devices: DeviceInfo[]; // 已排序
  map: DeviceMap;
  summary: Summary;
  series: SamplePoint[];
  hubUrl: string;
  setHubUrl: (url: string) => void;
  reconnect: () => void;
  stalledMinutes: number;
  stalledMs: number;
  setStalledMinutes: (n: number) => void;
  /** 取某台设备的日志（操作员侧缓冲）。 */
  logsOf: (deviceId: string) => DeviceLogMsg[];
  /** 开始/停止查看某台日志（打开/关闭设备详情时调用）。 */
  watch: (deviceId: string, on: boolean) => void;
  /** 当前批量下发任务的进度（null=尚未下发过）。 */
  configJob: JobState | null;
  /** 批量下发配置到指定设备，返回 jobId。 */
  pushConfig: (devices: Array<{ deviceId: string; deviceName: string }>, patch: ConfigPatch) => string;
  /** 批量下发操作日志（审计，最近在前）。 */
  configHistory: ConfigOp[];
  /** 发布任务进度（按 taskId）。 */
  publishTasks: PublishMap;
  /** 发起一条发布任务（记录进度行 + 发给 Hub）。 */
  enqueuePublish: (task: PublishTask, deviceName: string, fileName: string) => void;
  /** 改设备名：通知 Hub（别名，全网同步）+ 同步重命名视频文件夹 + 记审计日志。 */
  renameDevice: (deviceId: string, oldName: string, newName: string) => void;
  /** 改名审计日志（最近在前）。 */
  renameHistory: RenameOp[];
}

const Ctx = createContext<HubContextValue | null>(null);

export function useHub(): HubContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useHub 必须在 HubProvider 内使用");
  return v;
}

export function HubProvider({ children }: { children: ReactNode }) {
  const [hubUrl, setHubUrlState] = useState(() => loadSettings().hubUrl);
  const [connected, setConnected] = useState(false);
  const [map, setMap] = useState<DeviceMap>(new Map());
  const [logs, setLogs] = useState<LogMap>(new Map());
  const [configJob, setConfigJob] = useState<JobState | null>(null);
  const [configHistory, setConfigHistory] = useState<ConfigOp[]>(() => loadHistory());
  const [publishTasks, setPublishTasks] = useState<PublishMap>(new Map());
  const [renameHistory, setRenameHistory] = useState<RenameOp[]>(() => loadRenames());
  const socketRef = useRef<Socket | null>(null);

  const connect = (url: string) => {
    socketRef.current?.close();
    setMap(new Map());
    setLogs(new Map());
    setConnected(false);
    socketRef.current = connectHub(url, {
      snapshot: (l) => setMap(applySnapshot(l)),
      update: (d) => setMap((m) => applyUpdate(m, d)),
      status: setConnected,
      logs: (m) => setLogs((prev) => applyLogs(prev, m.deviceId, m.lines, m.replace)),
      progress: (p) => setConfigJob((prev) => applyProgress(prev, p)),
      publishProgress: (p) => setPublishTasks((prev) => applyPublishProgress(prev, p)),
    });
  };

  const doEnqueuePublish = (task: PublishTask, deviceName: string, fileName: string) => {
    setPublishTasks((prev) =>
      startPublish(prev, {
        taskId: task.taskId,
        deviceId: task.deviceId,
        deviceName,
        videoName: task.videoName,
        fileName,
      }),
    );
    track("publish_enqueue", { mode: task.source.kind });
    enqueuePublish(socketRef.current, task);
  };

  const doRenameDevice = (deviceId: string, oldName: string, newName: string) => {
    const alias = newName.trim();
    track("device_rename");
    renameDevice(socketRef.current, deviceId, alias); // Hub 全网同步别名
    const effective = alias || oldName;
    // 同步重命名视频文件夹（仅桌面应用内有该能力）。
    void getPublisherApi()?.renameFolder({ oldName, newName: effective }).catch(() => {});
    setRenameHistory((prev) => {
      const next = addRename(prev, { deviceId, from: oldName, to: effective, ts: Date.now() });
      saveRenames(next);
      return next;
    });
  };

  const watch = (deviceId: string, on: boolean) => {
    watchLogs(socketRef.current, deviceId, on);
    if (!on) setLogs((prev) => clearLogs(prev, deviceId)); // 关闭时清缓冲省内存
  };
  const logsOf = (deviceId: string) => getLogs(logs, deviceId);

  const doPushConfig = (
    targets: Array<{ deviceId: string; deviceName: string }>,
    patch: ConfigPatch,
  ): string => {
    const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    track("config_push", { devices: targets.length, groups: describePatchGroups(patch).length });
    setConfigJob(startJob(jobId, targets));
    // 审计：记一条下发操作（结果随进度回填）。
    setConfigHistory((prev) => {
      const next = addOp(prev, {
        jobId,
        ts: Date.now(),
        deviceCount: targets.length,
        groups: describePatchGroups(patch),
        patch,
        ok: 0,
        failed: 0,
        offline: 0,
        timeout: 0,
        pending: targets.length,
      });
      saveHistory(next);
      return next;
    });
    pushConfig(
      socketRef.current,
      jobId,
      targets.map((t) => t.deviceId),
      patch,
    );
    return jobId;
  };

  // 进度变化 → 回填对应操作日志的结果汇总（并持久化）。
  useEffect(() => {
    if (!configJob) return;
    const s = summarizeJob(configJob);
    setConfigHistory((prev) => {
      const next = updateOpResult(prev, configJob.jobId, {
        ok: s.ok,
        failed: s.failed,
        offline: s.offline,
        timeout: s.timeout,
        pending: s.pending,
      });
      if (next !== prev) saveHistory(next);
      return next;
    });
  }, [configJob]);

  const embedded = !!getHubApi();

  // 挂载即连：桌面应用内 → 取内嵌 Hub 端口连 localhost（免手填）；浏览器预览 → 用设置里的地址。
  useEffect(() => {
    let alive = true;
    const api = getHubApi();
    if (api) {
      void api
        .getPort()
        .then((port) => {
          if (!alive) return;
          const url = `http://localhost:${port}`;
          setHubUrlState(url);
          saveSettings({ hubUrl: url });
          connect(url);
        })
        .catch(() => alive && connect(hubUrl)); // 拿不到端口就退回设置里的地址
    } else {
      connect(hubUrl);
    }
    return () => {
      alive = false;
      socketRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setHubUrl = (url: string) => {
    setHubUrlState(url);
    saveSettings({ hubUrl: url });
  };
  const reconnect = () => connect(hubUrl);

  const [stalledMinutes, setStalledMinutesState] = useState(() => loadSettings().stalledMinutes);
  const setStalledMinutes = (n: number) => {
    setStalledMinutesState(n);
    saveSettings({ stalledMinutes: n });
  };

  const devices = useMemo(() => toSorted(map), [map]);
  const summary = useMemo(() => summarize(map), [map]);

  // 每 30s 采样一次，画趋势图（最近 60 点 = 半小时）。
  const summaryRef = useRef(summary);
  summaryRef.current = summary;
  const [series, setSeries] = useState<SamplePoint[]>([]);
  useEffect(() => {
    const id = setInterval(() => {
      const s = summaryRef.current;
      setSeries((prev) =>
        pushSample(prev, { t: Date.now(), online: s.online, running: s.running, interactions: s.interactions }, 60),
      );
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <Ctx.Provider
      value={{
        connected,
        embedded,
        devices,
        map,
        summary,
        series,
        hubUrl,
        setHubUrl,
        reconnect,
        stalledMinutes,
        stalledMs: stalledMinutes * 60_000,
        setStalledMinutes,
        logsOf,
        watch,
        configJob,
        pushConfig: doPushConfig,
        configHistory,
        publishTasks,
        enqueuePublish: doEnqueuePublish,
        renameDevice: doRenameDevice,
        renameHistory,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
