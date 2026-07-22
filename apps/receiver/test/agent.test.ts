import { describe, expect, it, vi } from "vitest";
import { createReceiverAgent } from "../src/agent";
import type { DownloadCommand, ReceiverProgress } from "../src/protocol";

const cmd = (taskId: string): DownloadCommand => ({ type: "download", taskId, url: `http://x/${taskId}`, videoName: `${taskId}.mp4` });

function setup(download?: () => Promise<{ ok: true; assetId: string } | { ok: false; error: string }>) {
  const progress: ReceiverProgress[] = [];
  const dl = vi.fn(download ?? (async () => ({ ok: true as const, assetId: "ph://1" })));
  const agent = createReceiverAgent({
    download: dl,
    sendProgress: (p) => progress.push(p),
  });
  const statuses = () => progress.map((p) => p.status);
  return { agent, progress, dl, statuses };
}

describe("createReceiverAgent.onDownload", () => {
  it("成功:回报 downloading → downloaded(assetId)", async () => {
    const t = setup(async () => ({ ok: true, assetId: "ph://xyz" }));
    await t.agent.onDownload(cmd("t1"));
    expect(t.statuses()).toEqual(["downloading", "downloaded"]);
    expect(t.progress[1]).toEqual({ type: "progress", taskId: "t1", status: "downloaded", assetId: "ph://xyz" });
  });

  it("失败:回报 downloading → failed(error)", async () => {
    const t = setup(async () => ({ ok: false, error: "网络断" }));
    await t.agent.onDownload(cmd("t1"));
    expect(t.statuses()).toEqual(["downloading", "failed"]);
    expect(t.progress[1]).toMatchObject({ status: "failed", error: "网络断" });
  });

  it("去重:同 taskId 重发 → 第二次跳过(只下载一次)", async () => {
    const t = setup();
    await t.agent.onDownload(cmd("t1"));
    await t.agent.onDownload(cmd("t1"));
    expect(t.dl).toHaveBeenCalledTimes(1);
    expect(t.statuses()).toEqual(["downloading", "downloaded"]); // 不重复回报
  });

  it("失败后可重试:同 taskId 再来 → 重新下载", async () => {
    let n = 0;
    const t = setup(async () => (++n === 1 ? { ok: false, error: "第一次失败" } : { ok: true, assetId: "ph://2" }));
    await t.agent.onDownload(cmd("t1"));
    await t.agent.onDownload(cmd("t1"));
    expect(t.dl).toHaveBeenCalledTimes(2);
    expect(t.statuses()).toEqual(["downloading", "failed", "downloading", "downloaded"]);
  });

  it("不同 taskId 各自独立处理", async () => {
    const t = setup();
    await t.agent.onDownload(cmd("t1"));
    await t.agent.onDownload(cmd("t2"));
    expect(t.dl).toHaveBeenCalledTimes(2);
    expect(t.progress.map((p) => p.taskId)).toEqual(["t1", "t1", "t2", "t2"]);
  });
});
