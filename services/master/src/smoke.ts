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
  const doTap = process.env.TAP === "1";

  // 目标:TARGETS=a,b,c 多目标(测组合查询能力);否则 TARGET 单目标。id 用注册表 phrase,否则当短语。
  function toQuery(arg: string, i: number): LocateQuery {
    const known = tiktokPlugin.targets.find((t) => t.id === arg.trim());
    return known
      ? { id: known.id, phrase: known.phrase, ...(known.region ? { region: known.region } : {}) }
      : { id: `t${i}:${arg.trim().slice(0, 12)}`, phrase: arg.trim() };
  }
  const argList = process.env.TARGETS
    ? process.env.TARGETS.split(",").map((s) => s.trim()).filter(Boolean)
    : [env("TARGET", "the heart-shaped like button on the right side")];
  const queries = argList.map(toQuery);
  console.log(`目标(${queries.length}):`);
  for (const q of queries) console.log(`  · ${q.id}  "${q.phrase}"`);

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
  console.log(`截图 ${shot.length} 字节 → 存 smoke-shot.png`);

  // 3) VLM 定位(一次组合查询,和引擎跑时同路径)
  const perceptor = createVlmPerceptor({ backend: createOpenAiBackend({ baseUrl: vlmUrl, model: vlmModel }) });
  console.log(`感知: ${vlmUrl} — 组合查询 ${queries.length} 目标中…`);
  const t0 = Date.now();
  const hits = await perceptor.locate(shot, queries);
  const ms = Date.now() - t0;
  const hitById = new Map(hits.map((h) => [h.id, h]));

  console.log(`\n结果(${ms}ms,命中 ${hits.length}/${queries.length}):`);
  for (const q of queries) {
    const h = hitById.get(q.id);
    if (h) {
      const c = centerPx(h.box, size);
      console.log(`  ✅ ${q.id} @ (${Math.round(c.x)},${Math.round(c.y)})  框[${h.box.map((v) => v.toFixed(2)).join(",")}]`);
    } else {
      console.log(`  ❌ ${q.id} 未命中`);
    }
  }
  if (queries.length > 1) {
    console.log(`\n💡 若某目标单查(TARGET=)能中、组合(TARGETS=)漏 → 模型组合能力不足这个数,减少一次查询的目标数。`);
  }

  // 4) 可选真点(点第一个命中的)
  if (doTap && hits.length > 0) {
    const c = centerPx(hits[0].box, size);
    await driver.tap(c);
    console.log(`\n👆 已点第一个命中 ${hits[0].id} (${Math.round(c.x)},${Math.round(c.y)})`);
  }
}

main().catch((e) => {
  console.error("冒烟失败:", e instanceof Error ? e.message : e);
  process.exit(1);
});
