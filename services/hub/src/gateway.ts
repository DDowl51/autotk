import type { Server, Socket } from "socket.io";
import {
  EVT,
  type DeviceStatus,
  type DeviceLogBatch,
  type WatchLogsMsg,
  type ConfigPushMsg,
  type ConfigResultMsg,
  type PublishEnqueueMsg,
  type PublishResultMsg,
  type DeviceRenameMsg,
} from "@mc/shared";
import type { DeviceRegistry } from "./domain/registry";
import type { LogHub } from "./domain/log-hub";
import { ConfigDispatcher } from "./domain/config-dispatcher";
import { PublishCoordinator } from "./domain/publish-coordinator";

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
export function attachGateway(io: Server, registry: DeviceRegistry, logHub: LogHub): void {
  // 批量配置下发协调器：在线才下发，逐台进度广播给所有操作员。
  const dispatcher = new ConfigDispatcher(
    (deviceId, jobId, patch) => {
      if (!registry.isOnline(deviceId)) return false;
      io.to(deviceRoom(deviceId)).emit(EVT.configApply, { jobId, patch });
      return true;
    },
    (p) => io.to(OPERATORS).emit(EVT.configProgress, p),
  );

  // 发布任务协调器：在线才下发，逐步进度广播给操作员。
  const publisher = new PublishCoordinator(
    (deviceId, task) => {
      if (!registry.isOnline(deviceId)) return false;
      io.to(deviceRoom(deviceId)).emit(EVT.publishTask, task);
      return true;
    },
    (p) => io.to(OPERATORS).emit(EVT.publishProgress, p),
  );

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

      socket.on(EVT.publishEnqueue, (m: PublishEnqueueMsg) => {
        if (m?.taskId && m.deviceId) publisher.start(m);
      });

      socket.on(EVT.deviceRename, (m: DeviceRenameMsg) => {
        if (!m?.deviceId) return;
        void registry
          .rename(m.deviceId, m.alias ?? "")
          .then((info) => {
            if (info) io.to(OPERATORS).emit(EVT.deviceUpdate, info);
          })
          .catch(logErr("rename"));
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
        void registry.disconnect(deviceId).then(broadcast).catch(logErr("disconnect"));
      });

      void registry
        .register({ deviceId, deviceName: auth.deviceName, version: auth.version })
        .then(broadcast)
        .catch(logErr("register"));
      return;
    }

    socket.disconnect(true); // 未知/非法角色
  });
}
