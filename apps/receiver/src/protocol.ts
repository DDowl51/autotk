// 收视频端 ↔ master 内部协议。
// ⚠️ 与 services/master/src/receiver/protocol.ts 是同一份语义,改一处两处同步(vendored)。
export interface DownloadCommand {
  type: "download";
  taskId: string;
  url: string;
  videoName: string;
}

export interface ReceiverHello {
  type: "hello";
  udid: string;
}

export interface ReceiverProgress {
  type: "progress";
  taskId: string;
  status: "downloading" | "downloaded" | "failed";
  assetId?: string;
  error?: string;
}

export const RECV_EVT = {
  hello: "receiver:hello",
  download: "receiver:download",
  progress: "receiver:progress",
} as const;
