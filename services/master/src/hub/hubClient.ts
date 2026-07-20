// master↔Hub 客户端(flat,D3=A):一个 master 进程为每台手机开一个 Hub 设备身份(deviceId=UDID)。
// 照旧手机端 apps/mobile/src/hub/client.ts 的连接/认证方式,做多设备版。复用现有协议零改动。
import {
  EVT,
  type ConfigApplyMsg,
  type ConfigPatch,
  type DeviceLogMsg,
  type DeviceRegisterMsg,
  type DeviceStatus,
  type PublishStatus,
  type PublishTaskMsg,
} from "@mc/shared";
import { realSocketFactory, type MinimalSocket, type SocketFactory } from "./socket";

export interface HubClientDeps {
  hubUrl: string;
  /** 测试注入;缺省 socket.io-client。 */
  socketFactory?: SocketFactory;
  /** 收到某台的批量配置 → 校验+应用,回 {ok,error}(hubClient 据此回 config:result)。 */
  onConfigApply(deviceId: string, patch: ConfigPatch): Promise<{ ok: boolean; error?: string }>;
  /** 收到某台的发布任务 → 交发布编排(W3)。 */
  onPublishTask(deviceId: string, task: PublishTaskMsg): void;
  log?(msg: string): void;
}

export interface HubClient {
  /** 某台上线时注册(开一个 socket 以该 deviceId 认证);重复注册幂等。 */
  registerDevice(info: DeviceRegisterMsg): void;
  reportStatus(deviceId: string, s: DeviceStatus): void;
  reportLog(deviceId: string, lines: DeviceLogMsg[]): void;
  reportPublishResult(deviceId: string, taskId: string, status: PublishStatus, error?: string): void;
  connected(deviceId: string): boolean;
  close(): Promise<void>;
}

export function createHubClient(d: HubClientDeps): HubClient {
  const factory = d.socketFactory ?? realSocketFactory;
  const sockets = new Map<string, MinimalSocket>();

  return {
    registerDevice(info) {
      if (sockets.has(info.deviceId)) return; // 幂等
      const socket = factory(d.hubUrl, {
        role: "device",
        deviceId: info.deviceId,
        deviceName: info.deviceName,
        version: info.version,
      });
      socket.on(EVT.configApply, (m: ConfigApplyMsg) => {
        void d.onConfigApply(info.deviceId, m.patch).then(
          (r) => socket.emit(EVT.configResult, { jobId: m.jobId, ok: r.ok, error: r.error }),
          (e) =>
            socket.emit(EVT.configResult, { jobId: m.jobId, ok: false, error: e instanceof Error ? e.message : String(e) }),
        );
      });
      socket.on(EVT.publishTask, (m: PublishTaskMsg) => d.onPublishTask(info.deviceId, m));
      sockets.set(info.deviceId, socket);
      d.log?.(`[hub] 注册设备 ${info.deviceId}`);
    },
    reportStatus(deviceId, s) {
      sockets.get(deviceId)?.emit(EVT.deviceStatus, s);
    },
    reportLog(deviceId, lines) {
      if (lines.length > 0) sockets.get(deviceId)?.emit(EVT.deviceLog, { lines });
    },
    reportPublishResult(deviceId, taskId, status, error) {
      sockets.get(deviceId)?.emit(EVT.publishResult, { taskId, status, error });
    },
    connected(deviceId) {
      return sockets.get(deviceId)?.connected ?? false;
    },
    async close() {
      for (const s of sockets.values()) s.disconnect();
      sockets.clear();
    },
  };
}
