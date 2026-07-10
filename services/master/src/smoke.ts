// 单机冒烟:driver-ios-wda 连一台手机 + perceptor-vlm 连 GPU 服务,跑最小链路——
//   截图 → VLM 定位一个目标 → 报坐标(可选真点)。验证整条链在真机上通 + grounding 准不准。
//
// 用法(填你的地址):
//   WDA_URL=http://<手机IP>:8100 VLM_URL=http://<GPU机IP>:8000 pnpm --filter @mc/master smoke
//   加 TAP=1 真点;TARGET=<注册表id或英文短语> 换目标;VLM_MODEL=<名> 若服务要求。
import { writeFileSync } from "node:fs";
import { centerPx, type LocateQuery } from "@auto/core";
import { createIosWdaDriver } from "@auto/driver-ios-wda";
import { createOpenAiBackend, createVlmPerceptor } from "@auto/perceptor-vlm";
import { tiktokPlugin } from "@auto/plugin-tiktok";

function env(name: string, def?: string): string {
  const v = process.env[name] ?? def;
  if (v === undefined) {
    console.error(`缺少环境变量 ${name}`);
    process.exit(2);
  }
  return v;
}

async function main(): Promise<void> {
  const wdaUrl = env("WDA_URL"); // http://<手机IP>:8100
  const vlmUrl = env("VLM_URL"); // http://<GPU机IP>:8000
  const vlmModel = env("VLM_MODEL", "locateanything-3b");
  const targetArg = env("TARGET", "the like button (heart icon) on the right rail");
  const doTap = process.env.TAP === "1";

  // 目标:若是注册表 id 用其 phrase(+region 先验);否则当英文短语直用。
  const known = tiktokPlugin.targets.find((t) => t.id === targetArg);
  const query: LocateQuery = known
    ? { id: known.id, phrase: known.phrase, ...(known.region ? { region: known.region } : {}) }
    : { id: "target", phrase: targetArg };
  console.log(`目标: ${known ? `注册表[${known.id}] "${known.phrase}"` : `短语 "${targetArg}"`}`);

  // 1) 驱动手机
  const driver = createIosWdaDriver(wdaUrl);
  console.log(`WDA: ${wdaUrl} — 建会话/自愈…`);
  await driver.ensureHealthy();
  await driver.activateApp(tiktokPlugin.appId);
  const size = await driver.windowSize();
  console.log(`前台 TikTok,分辨率 ${size.width}×${size.height}`);

  // 2) 截图
  const shot = await driver.screenshot();
  writeFileSync("smoke-shot.png", shot);
  console.log(`截图 ${shot.length} 字节 → 存 smoke-shot.png(可打开核对目标位置)`);

  // 3) VLM 定位
  const perceptor = createVlmPerceptor({ backend: createOpenAiBackend({ baseUrl: vlmUrl, model: vlmModel }) });
  console.log(`感知: ${vlmUrl} — 定位中…`);
  const t0 = Date.now();
  const hits = await perceptor.locate(shot, [query]);
  const ms = Date.now() - t0;

  const hit = hits.find((h) => h.id === query.id);
  if (!hit) {
    console.log(`❌ 未定位到(${ms}ms)。原因可能:目标不在当前屏 / 组合指令格式模型不吃(改 protocol.ts)/ region 先验过滤掉了。`);
    console.log(`   建议:先把 TikTok 停在有该目标的页面;或换 TARGET 试。`);
    process.exit(1);
  }
  const c = centerPx(hit.box, size);
  console.log(`✅ 命中(${ms}ms) 归一化框 [${hit.box.map((v) => v.toFixed(3)).join(", ")}]`);
  console.log(`   像素中心 (${Math.round(c.x)}, ${Math.round(c.y)}) — 对照 smoke-shot.png 看准不准`);

  // 4) 可选真点
  if (doTap) {
    await driver.tap(c);
    console.log(`👆 已点 (${Math.round(c.x)}, ${Math.round(c.y)})——看手机是否点中`);
  } else {
    console.log(`(未点。加 TAP=1 真点验证。)`);
  }
}

main().catch((e) => {
  console.error("冒烟失败:", e instanceof Error ? e.message : e);
  process.exit(1);
});
