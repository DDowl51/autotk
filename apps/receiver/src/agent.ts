// 收视频端核心:收 master 下发的 download 命令 → 下载存相册 → 回报进度。纯逻辑,注入 download/sendProgress。
// 去重(防 master 重发重复下载);失败可重试(master 重派)。socket/RN 全在外层(socketClient/album)。
import type { DownloadCommand, ReceiverProgress } from "./protocol";
import type { DownloadResult } from "./downloader";

export interface AgentDeps {
  /** 下载视频+存相册(= downloadToAlbum(cmd.url, cmd.videoName, {saveUrlToAlbum}))。约定不 reject。 */
  download(cmd: DownloadCommand): Promise<DownloadResult>;
  /** 回报进度给 master(socketClient 发 receiver:progress)。 */
  sendProgress(p: ReceiverProgress): void;
  log?(msg: string): void;
}

export interface ReceiverAgent {
  /** 处理一条下载命令(同 taskId 幂等:成功过不再下;失败会移除,可重试)。 */
  onDownload(cmd: DownloadCommand): Promise<void>;
}

export function createReceiverAgent(d: AgentDeps): ReceiverAgent {
  const done = new Set<string>(); // 已成功(或进行中)的 taskId

  return {
    async onDownload(cmd) {
      if (done.has(cmd.taskId)) {
        d.log?.(`任务 ${cmd.taskId} 已处理,跳过`);
        return;
      }
      done.add(cmd.taskId);
      d.sendProgress({ type: "progress", taskId: cmd.taskId, status: "downloading" });
      const r = await d.download(cmd);
      if (r.ok) {
        d.sendProgress({ type: "progress", taskId: cmd.taskId, status: "downloaded", assetId: r.assetId });
      } else {
        done.delete(cmd.taskId); // 失败可重试(master 重派同 taskId)
        d.sendProgress({ type: "progress", taskId: cmd.taskId, status: "failed", error: r.error });
      }
    },
  };
}
