import { describe, expect, it } from "vitest";
import { downloadToAlbum } from "../src/downloader";

describe("downloadToAlbum", () => {
  it("下载+入相册成功 → assetId,传入正确 url/文件名", async () => {
    let gotUrl = "";
    let gotName = "";
    const r = await downloadToAlbum("http://op/f/abc", "v.mp4", {
      saveUrlToAlbum: async (url, name) => {
        gotUrl = url;
        gotName = name;
        return "ph://123";
      },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.assetId).toBe("ph://123");
    expect(gotUrl).toBe("http://op/f/abc");
    expect(gotName).toBe("v.mp4");
  });

  it("下载失败(HTTP 非 2xx)→ 失败带原因", async () => {
    const r = await downloadToAlbum("http://x/v", "v.mp4", {
      saveUrlToAlbum: async () => {
        throw new Error("下载失败：HTTP 404");
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/404/);
  });

  it("写相册无权限 → 失败带原因", async () => {
    const r = await downloadToAlbum("http://x/v", "v.mp4", {
      saveUrlToAlbum: async () => {
        throw new Error("没有相册写入权限");
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/相册.*权限|没有相册写入权限/);
  });
});
