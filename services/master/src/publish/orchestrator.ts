// W3 master 发布编排:收 publish:task → 令收视频端下载入相册 → 存好后独占驱动 TikTok 发布 → 回报。
// 串行时序(D-γ):确认已存相册(downloaded)才切 TikTok;runExclusive 保证不抢前台。
import type { PublishStatus, PublishTaskMsg } from "@mc/shared";
import type { RunContext } from "@auto/core";
import type { ReceiverHub } from "../receiver/receiverServer";
import type { ReceiverProgress } from "../receiver/protocol";

export const DEFAULT_DOWNLOAD_TIMEOUT_MS = 120_000;

/** 只依赖 PhoneHandle.runExclusive(养号与发布串行不抢前台)。 */
export interface PublishHandle {
  runExclusive<T>(name: string, fn: (ctx: RunContext) => Promise<T>): Promise<T>;
}

export interface PublishOrchestratorDeps {
  receiver: ReceiverHub;
  getHandle(deviceId: string): PublishHandle | undefined;
  /** = plugin.publish 的包装:在 TikTok 里发布相册最新视频,返回终态。 */
  publishFn(ctx: RunContext, input: { caption: string }): Promise<"published" | "failed">;
  /** 逐步回报(→ hub.reportPublishResult)。 */
  report(deviceId: string, taskId: string, status: PublishStatus, error?: string): void;
  downloadTimeoutMs?: number;
  /** 超时用;测试注入(NEVER=成功路径靠进度,IMMEDIATE=测超时)。 */
  sleep(ms: number): Promise<void>;
}

export function createPublishOrchestrator(d: PublishOrchestratorDeps): {
  handlePublishTask(deviceId: string, task: PublishTaskMsg): Promise<void>;
} {
  // 单次订阅进度,按 taskId 唤醒等待者(下载是异步回报,需按任务对上)。
  const waiters = new Map<string, (p: ReceiverProgress) => void>();
  d.receiver.onProgress((_udid, p) => {
    if (p.status === "downloaded" || p.status === "failed") {
      const w = waiters.get(p.taskId);
      if (w) {
        waiters.delete(p.taskId);
        w(p);
      }
    }
  });

  function waitForDownload(taskId: string, timeoutMs: number): Promise<ReceiverProgress> {
    return new Promise((resolve) => {
      waiters.set(taskId, resolve);
      void d.sleep(timeoutMs).then(() => {
        if (waiters.delete(taskId)) resolve({ type: "progress", taskId, status: "failed", error: `下载超时(${timeoutMs}ms)` });
      });
    });
  }

  async function handlePublishTask(deviceId: string, task: PublishTaskMsg): Promise<void> {
    d.report(deviceId, task.taskId, "downloading");
    if (!d.receiver.isOnline(deviceId)) {
      d.report(deviceId, task.taskId, "failed", "收视频端离线");
      return;
    }
    try {
      await d.receiver.pushDownload(deviceId, { type: "download", taskId: task.taskId, url: task.source.url, videoName: task.videoName });
    } catch (e) {
      d.report(deviceId, task.taskId, "failed", e instanceof Error ? e.message : String(e));
      return;
    }

    const prog = await waitForDownload(task.taskId, d.downloadTimeoutMs ?? DEFAULT_DOWNLOAD_TIMEOUT_MS);
    if (prog.status !== "downloaded") {
      d.report(deviceId, task.taskId, "failed", prog.error ?? "下载失败");
      return;
    }
    d.report(deviceId, task.taskId, "downloaded");

    const handle = d.getHandle(deviceId);
    if (!handle) {
      d.report(deviceId, task.taskId, "failed", `无此设备句柄: ${deviceId}`);
      return;
    }
    d.report(deviceId, task.taskId, "publishing");
    try {
      const result = await handle.runExclusive("publish", (ctx) => d.publishFn(ctx, { caption: task.caption }));
      if (result === "published") d.report(deviceId, task.taskId, "published");
      else d.report(deviceId, task.taskId, "failed", "发布失败");
    } catch (e) {
      d.report(deviceId, task.taskId, "failed", e instanceof Error ? e.message : String(e));
    }
  }

  return { handlePublishTask };
}
