import { readFileSync } from "node:fs";
import { loadConfig, type RawConfig } from "./config";
import { api, type AscResource } from "node-app-store-connect-api";

/**
 * 账号自检：填完 config.json 后 `npm run check`，逐账号验证
 * ASC 密钥能连、证书/设备/bundleId 在不在 —— 不碰真机、不注册设备、不签名。
 */
async function main(): Promise<void> {
  const path = process.env.CONFIG_PATH ?? "./config.json";
  const raw = JSON.parse(readFileSync(path, "utf8")) as RawConfig;
  const cfg = loadConfig(raw, process.env, (p) => readFileSync(p, "utf8"));

  let ok = true;
  for (const acc of cfg.poolAccounts) {
    const asc = cfg.ascResolver(acc.name);
    console.log(`\n[账号 ${acc.name}]  issuer=${asc.issuerId}  key=${asc.keyId}  profileType=${asc.profileType}`);
    try {
      const client = await api({ issuerId: asc.issuerId, apiKey: asc.keyId, privateKey: asc.privateKey });
      const devices = (await client.fetchJson("devices?limit=200")) as AscResource[];
      const certs = (await client.fetchJson("certificates?limit=200")) as AscResource[];
      const bundleIds = (await client.fetchJson("bundleIds?limit=200")) as AscResource[];
      console.log(`  ✓ ASC 连接成功：设备 ${devices.length} 台 · 证书 ${certs.length} · bundleId ${bundleIds.length}`);
      console.log(`  额度：本地记账 ${acc.devices.length}/${acc.capacity}（Apple 实际已注册 ${devices.length} 台）`);
      const devCerts = certs.filter((c) => String(c.attributes?.["certificateType"] ?? "").includes("DEVELOPMENT"));
      console.log(`  ${devCerts.length > 0 ? "✓" : "✗"} 开发证书 ${devCerts.length} 张${devCerts.length === 0 ? "（ASC 里没有 DEVELOPMENT 证书）" : ""}`);
      if (devCerts.length === 0) ok = false;
      for (const [appKey, ident] of Object.entries(asc.bundleIds)) {
        const found = bundleIds.some((b) => b.attributes?.["identifier"] === ident);
        console.log(`  ${found ? "✓" : "✗"} App ${appKey} → bundleId「${ident}」${found ? "" : " 在 ASC 里没找到（去 Identifiers 建/核对）"}`);
        if (!found) ok = false;
      }
    } catch (e) {
      ok = false;
      console.log(`  ✗ 失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.log(ok ? "\n✅ 全部账号就绪，可以进真机联调了。" : "\n❗ 有问题，按上面的 ✗ 修一下再跑。");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
