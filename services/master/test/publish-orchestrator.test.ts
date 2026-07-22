import { describe, expect, it, vi } from "vitest";
import type { PublishStatus, PublishTaskMsg } from "@mc/shared";
import { createPublishOrchestrator, type PublishHandle } from "../src/publish/orchestrator";
import type { ReceiverHub } from "../src/receiver/receiverServer";
import type { ReceiverProgress } from "../src/receiver/protocol";

const task: PublishTaskMsg = { taskId: "t1", videoName: "v.mp4", caption: "hello", source: { kind: "lan", url: "http://x/v" } };

function fakeReceiver() {
  let cb: (udid: string, p: ReceiverProgress) => void = () => {};
  const state = { online: true, pushErr: null as Error | null, pushed: [] as { udid: string; cmd: unknown }[] };
  const hub: ReceiverHub = {
    isOnline: () => state.online,
    pushDownload: async (udid, cmd) => {
      if (state.pushErr) throw state.pushErr;
      state.pushed.push({ udid, cmd });
    },
    onProgress: (fn) => {
      cb = fn;
    },
    close: async () => {},
  };
  return { hub, state, fire: (udid: string, p: ReceiverProgress) => cb(udid, p) };
}

const NEVER = () => new Promise<void>(() => {}); // sleep 永不 resolve(成功路径靠 fire 进度)
const IMMEDIATE = async () => {}; // sleep 立即 resolve(超时路径)

function setup(opts: { sleep?: () => Promise<void>; publish?: () => Promise<"published" | "failed">; handle?: PublishHandle | undefined } = {}) {
  const { hub, state, fire } = fakeReceiver();
  const report = vi.fn();
  const runExclusive = vi.fn(async (_name: string, fn: (ctx: never) => Promise<unknown>) => fn({} as never));
  const handle: PublishHandle | undefined = "handle" in opts ? opts.handle : ({ runExclusive } as unknown as PublishHandle);
  const publishFn = vi.fn(opts.publish ?? (async () => "published" as const));
  const orch = createPublishOrchestrator({
    receiver: hub,
    getHandle: () => handle,
    publishFn,
    report,
    sleep: opts.sleep ?? NEVER,
    downloadTimeoutMs: 5000,
  });
  const statuses = () => report.mock.calls.map((c) => c[2] as PublishStatus);
  return { orch, state, fire, report, publishFn, runExclusive, statuses };
}

async function untilPushed(state: { pushed: unknown[] }) {
  await vi.waitFor(() => expect(state.pushed.length).toBe(1));
}

describe("createPublishOrchestrator.handlePublishTask", () => {
  it("端离线 → failed,不下载不发布", async () => {
    const t = setup();
    t.state.online = false;
    await t.orch.handlePublishTask("d1", task);
    expect(t.statuses()).toEqual(["downloading", "failed"]);
    expect(t.state.pushed).toHaveLength(0);
    expect(t.publishFn).not.toHaveBeenCalled();
  });

  it("pushDownload 抛错(离线竞态)→ failed", async () => {
    const t = setup();
    t.state.pushErr = new Error("收视频端离线: d1");
    await t.orch.handlePublishTask("d1", task);
    expect(t.statuses()).toEqual(["downloading", "failed"]);
    expect(t.publishFn).not.toHaveBeenCalled();
  });

  it("下载 failed → 不发布,回 failed", async () => {
    const t = setup();
    const p = t.orch.handlePublishTask("d1", task);
    await untilPushed(t.state);
    t.fire("d1", { type: "progress", taskId: "t1", status: "failed", error: "网络断" });
    await p;
    expect(t.statuses()).toEqual(["downloading", "failed"]);
    expect(t.publishFn).not.toHaveBeenCalled();
  });

  it("下载 downloaded → runExclusive + publishFn 调用,published(完整状态序列)", async () => {
    const t = setup();
    const p = t.orch.handlePublishTask("d1", task);
    await untilPushed(t.state);
    t.fire("d1", { type: "progress", taskId: "t1", status: "downloaded", assetId: "ph://1" });
    await p;
    expect(t.runExclusive).toHaveBeenCalledOnce();
    expect(t.publishFn).toHaveBeenCalledWith(expect.anything(), { caption: "hello" });
    expect(t.statuses()).toEqual(["downloading", "downloaded", "publishing", "published"]);
  });

  it("发布 failed → 回 failed", async () => {
    const t = setup({ publish: async () => "failed" as const });
    const p = t.orch.handlePublishTask("d1", task);
    await untilPushed(t.state);
    t.fire("d1", { type: "progress", taskId: "t1", status: "downloaded", assetId: "ph://1" });
    await p;
    expect(t.statuses()).toEqual(["downloading", "downloaded", "publishing", "failed"]);
  });

  it("下载超时(sleep 立即触发,无进度)→ failed", async () => {
    const t = setup({ sleep: IMMEDIATE });
    await t.orch.handlePublishTask("d1", task);
    expect(t.statuses()).toEqual(["downloading", "failed"]);
    expect(t.publishFn).not.toHaveBeenCalled();
  });

  it("无设备句柄 → failed(下载已成功但发不了)", async () => {
    const t = setup({ handle: undefined });
    const p = t.orch.handlePublishTask("d1", task);
    await untilPushed(t.state);
    t.fire("d1", { type: "progress", taskId: "t1", status: "downloaded" });
    await p;
    expect(t.statuses()).toEqual(["downloading", "downloaded", "failed"]);
  });

  it("只认自己 taskId 的进度(别的 task 进度不误触)", async () => {
    const t = setup();
    const p = t.orch.handlePublishTask("d1", task);
    await untilPushed(t.state);
    t.fire("d1", { type: "progress", taskId: "OTHER", status: "downloaded" }); // 别的任务
    t.fire("d1", { type: "progress", taskId: "t1", status: "downloaded" }); // 自己的
    await p;
    expect(t.statuses()).toEqual(["downloading", "downloaded", "publishing", "published"]);
  });
});
