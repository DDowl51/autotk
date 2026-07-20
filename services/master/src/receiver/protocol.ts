// master ↔ 收视频端 的内部协议(复用 publish 语义,**非 Hub 协议**)。
// β1 后台常驻:收视频端(精简 autotk)连 master 的这个通道,收下载命令、回下载进度。

/** master → 收视频端:下载这个视频并存相册。 */
export interface DownloadCommand {
  type: "download";
  taskId: string;
  url: string;
  videoName: string;
}

/** 收视频端 → master:上线握手(报自己的 udid)。 */
export interface ReceiverHello {
  type: "hello";
  udid: string;
}

/** 收视频端 → master:下载/存相册进度。downloaded 带 assetId;failed 带 error。 */
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
