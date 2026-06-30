import { describe, it, expect } from "vitest";
import { qrSvg, qrPngDataUrl } from "../src/adapters/qr";

describe("qr", () => {
  it("qrSvg 生成 SVG", async () => {
    const svg = await qrSvg("https://install.example.com/ota/wda");
    expect(svg).toMatch(/<svg/);
    expect(svg).toMatch(/<\/svg>/);
  });

  it("qrPngDataUrl 生成 PNG data URL", async () => {
    const url = await qrPngDataUrl("https://install.example.com/ota/autotk");
    expect(url).toMatch(/^data:image\/png;base64,/);
  });
});
