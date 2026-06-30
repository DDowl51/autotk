import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { scanRoot, ensureDeviceFolder, readSameNameTxt, readCaptionsTxt } from "../src/scan";
import { loadManifest, saveManifest } from "../src/manifest";
import { filterUnpublished, markPublished, emptyManifest } from "../src/dedup";
import { parseCaptionsFile, resolveCaption } from "../src/captions";
import { LanFileServer } from "../src/lan-server";

let root: string;

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "pub-"));
  const a = path.join(root, "手机A");
  await fs.mkdir(a, { recursive: true });
  await fs.writeFile(path.join(a, "v1.mp4"), "AAAA");
  await fs.writeFile(path.join(a, "v2.mov"), "BBBBBB");
  await fs.writeFile(path.join(a, "note.txt"), "not a video");
  await fs.writeFile(path.join(a, "v1.txt"), "同名文案");
  await fs.writeFile(path.join(a, "captions.txt"), "v2.mov = 来自captions");
  // 一个空文件夹也应被安全处理
  await fs.mkdir(path.join(root, "手机B"), { recursive: true });
});

afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("scan + manifest + 文案 (真文件系统)", () => {
  it("scanRoot 只取视频、按名排序、带大小", async () => {
    const items = await scanRoot(root);
    const a = items.filter((i) => i.deviceName === "手机A");
    expect(a.map((i) => i.fileName)).toEqual(["v1.mp4", "v2.mov"]);
    expect(a.find((i) => i.fileName === "v1.mp4")!.size).toBe(4);
  });

  it("scanRoot 对不存在的根目录返回 []", async () => {
    expect(await scanRoot(path.join(root, "nope"))).toEqual([]);
  });

  it("同名 txt / captions.txt 解析 + 文案优先级", async () => {
    const a = path.join(root, "手机A");
    const v1 = path.join(a, "v1.mp4");
    expect((await readSameNameTxt(v1))?.trim()).toBe("同名文案");
    const capMap = parseCaptionsFile((await readCaptionsTxt(a)) ?? "");
    expect(resolveCaption("v1.mp4", { sameNameTxt: await readSameNameTxt(v1), captionsMap: capMap })).toBe("同名文案");
    expect(resolveCaption("v2.mov", { captionsMap: capMap })).toBe("来自captions");
  });

  it("manifest 落盘 + 读回 + 去重", async () => {
    const a = path.join(root, "手机A");
    const items = (await scanRoot(root)).filter((i) => i.deviceName === "手机A");
    let m = emptyManifest();
    m = markPublished(m, items[0]); // 标记 v1 已发
    await saveManifest(a, m);
    const reloaded = await loadManifest(a);
    expect(filterUnpublished(items, reloaded).map((i) => i.fileName)).toEqual(["v2.mov"]);
  });

  it("ensureDeviceFolder 幂等建夹", async () => {
    const dir = await ensureDeviceFolder(root, "手机C");
    const st = await fs.stat(dir);
    expect(st.isDirectory()).toBe(true);
    await ensureDeviceFolder(root, "手机C"); // 再来一次不报错
  });
});

describe("LanFileServer (真 HTTP)", () => {
  it("注册文件 → 手机用 URL 取到原始字节；坏 token 404", async () => {
    const srv = new LanFileServer();
    await srv.start("127.0.0.1", 0);
    const file = path.join(root, "手机A", "v1.mp4");
    const token = srv.register(file);
    expect(srv.register(file)).toBe(token); // 幂等

    const res = await fetch(srv.urlFor(token, "127.0.0.1"));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("AAAA");

    const bad = await fetch(`http://127.0.0.1:${srv.getPort()}/f/deadbeef`);
    expect(bad.status).toBe(404);

    await srv.close();
  });
});
