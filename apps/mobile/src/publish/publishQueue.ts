import type { PublishTaskMsg, PublishStatus } from "../hub/protocol";
import { withTimeout } from "../engine/timeout";

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

/**
 * 「下载视频 + 写入相册」的默认超时（毫秒）。
 * ⚠️ 下载/写相册这条链路本身不带超时（expo 的 downloadAsync/createAssetAsync 都可能永久 pending：
 * 局域网源不通、写相册卡住、或 App 被切后台 JS 冻结时，会永远停在 "downloading" 且既不失败也不重试）。
 * 兜一层超时：卡住即 failed，Hub 可重派，而不是静默挂死。真机曾见「视频已下到相册、日志却卡 downloading」——
 * 正是下载后半段（写相册/promise 不兑现）卡住，故超时必须包住整个 download()（含写相册），不能只包网络下载。
 */
export const DEFAULT_DOWNLOAD_TIMEOUT_MS = 120_000;

/** 下载结果：成功带 assetUri，失败带 error。 */
type DownloadOutcome = { ok: boolean; assetUri?: string; error?: string };

export interface PublishRunDeps {
  /** 下载视频并写入相册，成功返回 assetUri。约定不 reject（内部 try/catch 返回 {ok:false}）。 */
  download: (task: PublishTaskMsg) => Promise<DownloadOutcome>;
  /** 在 TikTok 里发布该相册视频（失败抛错）。 */
  publishVideo: (assetUri: string, caption: string) => Promise<void>;
  /** 逐步回报状态（转给 Hub + 写日志）。 */
  onStatus: (status: PublishStatus, error?: string) => void;
  /** 下载+写相册的超时（毫秒）。默认 DEFAULT_DOWNLOAD_TIMEOUT_MS；超时→failed，Hub 可重派。 */
  downloadTimeoutMs?: number;
}

/** 跑完一条发布任务，返回终态（published / failed）。 */
export async function runPublish(task: PublishTaskMsg, deps: PublishRunDeps): Promise<PublishStatus> {
  deps.onStatus("downloading");
  const timeoutMs = deps.downloadTimeoutMs ?? DEFAULT_DOWNLOAD_TIMEOUT_MS;
  // download() 约定不 reject（downloadToAlbum 内部已 try/catch 成 {ok:false}），
  // 故 withTimeout 只会因「超时」而 reject → catch 到即视为下载超时。
  const dl: DownloadOutcome = await withTimeout(deps.download(task), timeoutMs / 1000).catch(() => ({
    ok: false,
    error: `下载超时(${timeoutMs}ms)——网络或写入相册卡住，已中止（管理中心可重派）`,
  }));
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
