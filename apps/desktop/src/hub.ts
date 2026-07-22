import { io, type Socket } from "socket.io-client";
import {
  EVT,
  type ControlAction,
  type DeviceInfo,
  type DeviceLogsMsg,
  type ConfigPatch,
  type ConfigProgressMsg,
  type PublishProgressMsg,
  type PublishTask,
} from "@mc/shared";

export interface HubHandlers {
  snapshot: (list: DeviceInfo[]) => void;
  update: (d: DeviceInfo) => void;
  status: (connected: boolean) => void;
  logs: (m: DeviceLogsMsg) => void;
  progress: (p: ConfigProgressMsg) => void;
  publishProgress: (p: PublishProgressMsg) => void;
  removed?: (deviceId: string) => void;
}

/** 以操作员身份连 Hub，订阅设备快照 + 单台变更 + 日志推送。 */
export function connectHub(url: string, h: HubHandlers): Socket {
  const socket = io(url, {
    auth: { role: "operator" },
    transports: ["websocket"],
    reconnection: true,
  });
  socket.on("connect", () => h.status(true));
  socket.on("disconnect", () => h.status(false));
  socket.on("connect_error", () => h.status(false));
  socket.on(EVT.devicesSnapshot, h.snapshot);
  socket.on(EVT.deviceUpdate, h.update);
  socket.on(EVT.deviceLogs, h.logs);
  socket.on(EVT.configProgress, h.progress);
  socket.on(EVT.publishProgress, h.publishProgress);
  socket.on(EVT.deviceRemoved, (m: { deviceId: string }) => h.removed?.(m.deviceId));
  return socket;
}

/** 发起一条发布任务。 */
export function enqueuePublish(socket: Socket | null, task: PublishTask): void {
  socket?.emit(EVT.publishEnqueue, task);
}

/** 给设备改名（别名，空串=清除）。 */
export function renameDevice(socket: Socket | null, deviceId: string, alias: string): void {
  socket?.emit(EVT.deviceRename, { deviceId, alias });
}

/** 删除设备（从列表移除；手机重连会重新出现）。 */
export function removeDevice(socket: Socket | null, deviceId: string): void {
  socket?.emit(EVT.deviceRemove, { deviceId });
}

/** 订阅/取消订阅某台设备的日志（打开/关闭设备详情时调用）。 */
export function watchLogs(socket: Socket | null, deviceId: string, on: boolean): void {
  socket?.emit(EVT.watchLogs, { deviceId, on });
}

/** 批量下发配置补丁到指定设备。 */
export function pushConfig(
  socket: Socket | null,
  jobId: string,
  deviceIds: string[],
  patch: ConfigPatch,
): void {
  socket?.emit(EVT.configPush, { jobId, deviceIds, patch });
}

/** 批量远程启停一组设备(pause=停止/resume=启动)。 */
export function pushControl(socket: Socket | null, deviceIds: string[], action: ControlAction): void {
  if (deviceIds.length > 0) socket?.emit(EVT.controlPush, { deviceIds, action });
}
