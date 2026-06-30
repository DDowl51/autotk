import type { PublishTaskMsg, PublishStatus } from "../hub/protocol";

/**
 * 手机端发布队列 + 单条发布流程。纯逻辑，便于单测：
 * - PublishQueue：按 taskId 去重、先进先出、记录每条状态；
 * - runPublish：一条任务的状态机（下载→入相册→发布），靠注入的依赖驱动，逐步回报状态。
 * 真正的「下载入相册」「在 TikTok 里发布」由 useEngine 注入（downloader + TikTokUI.publishVideo）。
 */

export interface QueuedTask {
  task: PublishTaskMsg;
  status: PublishStatus;
  error?: string;
}

export class PublishQueue {
  private readonly tasks = new Map<string, QueuedTask>();
  private readonly order: string[] = [];

  /** 入队；已存在的 taskId 视为重复，返回 false（防 Hub 重发导致重复发布）。 */
  enqueue(task: PublishTaskMsg): boolean {
    if (this.tasks.has(task.taskId)) return false;
    this.tasks.set(task.taskId, { task, status: "sent" });
    this.order.push(task.taskId);
    return true;
  }

  /** 取下一条「待处理」（sent 状态、尚未开始）的任务。 */
  nextPending(): QueuedTask | undefined {
    for (const id of this.order) {
      const t = this.tasks.get(id);
      if (t && t.status === "sent") return t;
    }
    return undefined;
  }

  setStatus(taskId: string, status: PublishStatus, error?: string): void {
    const t = this.tasks.get(taskId);
    if (t) {
      t.status = status;
      t.error = error;
    }
  }

  get(taskId: string): QueuedTask | undefined {
    return this.tasks.get(taskId);
  }

  list(): QueuedTask[] {
    return this.order.map((id) => this.tasks.get(id)!).filter(Boolean);
  }
}

export interface PublishRunDeps {
  /** 下载视频并写入相册，成功返回 assetUri。 */
  download: (task: PublishTaskMsg) => Promise<{ ok: boolean; assetUri?: string; error?: string }>;
  /** 在 TikTok 里发布该相册视频（失败抛错）。 */
  publishVideo: (assetUri: string, caption: string) => Promise<void>;
  /** 逐步回报状态（转给 Hub + 写日志）。 */
  onStatus: (status: PublishStatus, error?: string) => void;
}

/** 跑完一条发布任务，返回终态（published / failed）。 */
export async function runPublish(task: PublishTaskMsg, deps: PublishRunDeps): Promise<PublishStatus> {
  deps.onStatus("downloading");
  const dl = await deps.download(task);
  if (!dl.ok || !dl.assetUri) {
    deps.onStatus("failed", dl.error ?? "下载失败");
    return "failed";
  }
  deps.onStatus("downloaded");

  deps.onStatus("publishing");
  try {
    await deps.publishVideo(dl.assetUri, task.caption);
  } catch (e) {
    deps.onStatus("failed", e instanceof Error ? e.message : String(e));
    return "failed";
  }
  deps.onStatus("published");
  return "published";
}
