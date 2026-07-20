import type { Server, Socket } from "socket.io";
import {
  EVT,
  type DeviceStatus,
  type DeviceLogBatch,
  type WatchLogsMsg,
  type ConfigPushMsg,
  type ControlPushMsg,
  type ConfigResultMsg,
  type PublishEnqueueMsg,
  type PublishResultMsg,
  type DeviceRenameMsg,
  type DeviceRemoveMsg,
} from "@mc/shared";
import type { DeviceRegistry } from "./domain/registry";
import type { LogHub } from "./domain/log-hub";
import { ConfigDispatcher } from "./domain/config-dispatcher";
import { PublishCoordinator } from "./domain/publish-coordinator";
import { PendingStore } from "./domain/pending-store";
import type { ScheduledStore } from "./domain/scheduled-store";

const OPERATORS = "operators";
const deviceRoom = (deviceId: string) => `dev:${deviceId}`;

interface DeviceAuth {
  role?: string;
  deviceId?: string;
  deviceName?: string;
  version?: string;
}

/**
 * 把 socket.io 连接接到 DeviceRegistry + LogHub：
 * - 操作员（Electron）：加入 operators 房间，连上即收全量快照，之后收单台变更；
 *   可 logs:watch 订阅某台日志（先回快照，再实时收 device:logs），并触发手机切上报频率。
 * - 设备（手机）：注册→广播上线；收状态上报→广播；收日志批量→转发给正在看的操作员；
 *   收到 logs:wanted（首个/最后一个观看者变化时）切上报频率；断开→广播下线。
 * handshake.auth.role 区分角色（device 还需 deviceId/deviceName）。
 */
export function attachGateway(
  io: Server,
  registry: DeviceRegistry,
  logHub: LogHub,
  pending: PendingStore = new PendingStore(),
  scheduled?: ScheduledStore,
  /** 发布成功回调（deviceId, videoName）：内嵌桌面据此权威登记已发去重，不依赖发布页是否开着。 */
  onPublished?: (deviceId: string, videoName: string) => void,
): void {
  // 批量配置下发协调器：在线才下发，逐台进度广播给所有操作员；
  // 离线台入「待补发」队列（重连时补发），而非静默丢弃。
  const dispatcher = new ConfigDispatcher(
    (deviceId, jobId, patch) => {
      if (!registry.isOnline(deviceId)) {
        void pending.enqueueConfig(deviceId, jobId, patch);
        return false;
      }
      io.to(deviceRoom(deviceId)).emit(EVT.configApply, { jobId, patch });
      return true;
    },
    (p) => io.to(OPERATORS).emit(EVT.configProgress, p),
  );

  // 发布任务协调器：在线才下发，逐步进度广播给操作员；离线台同样入队补发。
  const publisher = new PublishCoordinator(
    (deviceId, task) => {
      if (!registry.isOnline(deviceId)) {
        void pending.enqueuePublish(deviceId, task);
        return false;
      }
      io.to(deviceRoom(deviceId)).emit(EVT.publishTask, task);
      return true;
    },
    (p) => io.to(OPERATORS).emit(EVT.publishProgress, p),
    {
      // 未来定时任务落盘/到点出盘 → Hub 重启后能重新排程。
      persistScheduled: scheduled ? (t) => scheduled.add(t) : undefined,
      dropScheduled: scheduled ? (id) => scheduled.remove(id) : undefined,
      onPublished, // 发布成功 → 服务端权威登记已发去重
    },
  );

  // 启动时把持久化的定时发布重新排程（Hub 重启不丢）：未来的重新装表，已过点的立即下发
  // （在线则送达、离线则进补发队列）。iterate 快照，start() 内部的增删不影响本次遍历。
  if (scheduled) for (const t of scheduled.list()) publisher.start(t);

  // 设备（重）连上后，把它离线期间积压的下发/发布补发下去（重新走协调器 → 正常进度/超时）。
  // 用**原 jobId**补发：ConfigDispatcher.start 现在会合并（不覆盖）同 jobId 的等待表，故不会冲掉
  // 同批仍在等回执的在线设备，且操作员看板能按原 jobId 把该设备从 offline 正确翻到 ok。
  const flushPending = async (deviceId: string): Promise<void> => {
    const items = await pending.take(deviceId);
    for (const it of items) {
      if (it.kind === "config") {
        dispatcher.start(it.jobId, [deviceId], it.patch);
      } else {
        publisher.start({ ...it.task, deviceId });
      }
    }
  };

  // 异步链兜底：registry 若因存储 IO 失败而 reject，记日志而非未捕获 rejection 崩 Hub。
  const logErr = (label: string) => (e: unknown) => {
    // eslint-disable-next-line no-console
    console.error(`[gateway] ${label} 失败：`, e);
  };

  io.on("connection", (socket: Socket) => {
    const auth = socket.handshake.auth as DeviceAuth;

    if (auth.role === "operator") {
      socket.join(OPERATORS);
      void registry.snapshot().then((list) => socket.emit(EVT.devicesSnapshot, list)).catch(logErr("snapshot"));

      socket.on(EVT.watchLogs, (m: WatchLogsMsg) => {
        if (!m?.deviceId) return;
        if (m.on) {
          const first = logHub.addWatcher(m.deviceId, socket.id);
          // 先把已有缓冲全量发过去（replace），随后才是增量。
          socket.emit(EVT.deviceLogs, {
            deviceId: m.deviceId,
            lines: logHub.snapshot(m.deviceId),
            replace: true,
          });
          if (first) io.to(deviceRoom(m.deviceId)).emit(EVT.logsWanted, { on: true });
        } else if (logHub.removeWatcher(m.deviceId, socket.id)) {
          io.to(deviceRoom(m.deviceId)).emit(EVT.logsWanted, { on: false });
        }
      });

      socket.on(EVT.configPush, (m: ConfigPushMsg) => {
        if (m?.jobId && Array.isArray(m.deviceIds)) dispatcher.start(m.jobId, m.deviceIds, m.patch);
      });

      // 远程启停:转发给各设备房间(在线才收;离线台不排队——启停是实时控制,重连后由 master 决定初态)。
      socket.on(EVT.controlPush, (m: ControlPushMsg) => {
        if (!Array.isArray(m?.deviceIds) || (m.action !== "pause" && m.action !== "resume")) return;
        for (const id of m.deviceIds) io.to(deviceRoom(id)).emit(EVT.deviceControl, { action: m.action });
      });

      socket.on(EVT.publishEnqueue, (m: PublishEnqueueMsg) => {
        if (m?.taskId && m.deviceId) publisher.start(m);
      });

      socket.on(EVT.deviceRename, (m: DeviceRenameMsg) => {
        if (!m?.deviceId) return;
        void registry
          .renameChecked(m.deviceId, m.alias ?? "")
          .then(({ info, conflict }) => {
            // 冲突（重名）→ 已拒绝改名，info 是未改信息 → 广播回去让操作员看板上的乐观改名回退。
            if (conflict) {
              // eslint-disable-next-line no-console
              console.warn(`[gateway] 设备改名冲突已拒绝：${m.deviceId} → 「${m.alias}」`);
            }
            if (info) io.to(OPERATORS).emit(EVT.deviceUpdate, info);
          })
          .catch(logErr("rename"));
      });

      socket.on(EVT.deviceRemove, (m: DeviceRemoveMsg) => {
        if (!m?.deviceId) return;
        void registry
          .remove(m.deviceId)
          .then(() => io.to(OPERATORS).emit(EVT.deviceRemoved, { deviceId: m.deviceId }))
          .catch(logErr("remove"));
      });

      socket.on("disconnect", () => {
        for (const deviceId of logHub.removeWatcherEverywhere(socket.id)) {
          io.to(deviceRoom(deviceId)).emit(EVT.logsWanted, { on: false });
        }
      });
      return;
    }

    if (auth.role === "device" && auth.deviceId && auth.deviceName) {
      const deviceId = auth.deviceId;
      socket.join(deviceRoom(deviceId));
      const broadcast = (info: unknown) => {
        if (info) io.to(OPERATORS).emit(EVT.deviceUpdate, info);
      };

      socket.on(EVT.deviceStatus, (status: DeviceStatus) => {
        void registry.updateStatus(deviceId, status).then(broadcast).catch(logErr("updateStatus"));
      });

      socket.on(EVT.deviceLog, (batch: DeviceLogBatch) => {
        const lines = logHub.append(deviceId, batch?.lines ?? []);
        if (lines.length === 0) return;
        for (const watcherId of logHub.watchersOf(deviceId)) {
          io.to(watcherId).emit(EVT.deviceLogs, { deviceId, lines });
        }
      });

      socket.on(EVT.configResult, (m: ConfigResultMsg) => {
        if (m?.jobId) dispatcher.onResult(m.jobId, deviceId, !!m.ok, m.error);
      });

      socket.on(EVT.publishResult, (m: PublishResultMsg) => {
        if (m?.taskId && m.status) publisher.onResult(m.taskId, m.status, m.error);
      });

      socket.on("disconnect", () => {
        // 传 socket.id：只有当前在线 socket 断开才标离线，旧 socket 迟到 disconnect 被忽略。
        void registry.disconnect(deviceId, socket.id).then(broadcast).catch(logErr("disconnect"));
      });

      void registry
        .register({ deviceId, deviceName: auth.deviceName, version: auth.version }, socket.id)
        .then((info) => {
          broadcast(info);
          void flushPending(deviceId).catch(logErr("flushPending")); // 补发离线期间积压的下发/发布
        })
        .catch(logErr("register"));
      return;
    }

    socket.disconnect(true); // 未知/非法角色
  });
}
