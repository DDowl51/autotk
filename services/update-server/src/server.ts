import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { UpdateStore } from "./store";
import { signManifest } from "./core/sign";
import { contentTypeForExt } from "./core/manifest";
import type { Config } from "./config";

/**
 * 自建 expo-updates 协议服务（protocol version 1）：
 * - GET /api/manifest ——客户端按 expo-platform / expo-runtime-version 头拉最新 manifest；
 *   带 expo-expect-signature 头且配了私钥时以 multipart + expo-signature 返回（客户端用打进 App 的
 *   certificate.pem 验签）。
 * - GET /assets/:rv/:folder/* —— 下发 bundle 与静态资源。
 */
export function buildServer(cfg: Config): FastifyInstance {
  const app = Fastify({ logger: true });
  const store = new UpdateStore(cfg.updatesDir, cfg.baseUrl);

  app.get("/healthz", async () => ({ ok: true }));

  const manifestHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const h = req.headers;
    const platform = String(h["expo-platform"] ?? "ios");
    const runtimeVersion = String(h["expo-runtime-version"] ?? "");
    const wantsSignature = h["expo-expect-signature"] != null;
    if (!runtimeVersion) {
      return reply.code(400).send({ error: "缺少 expo-runtime-version 头" });
    }

    const manifest = await store.latestManifest(runtimeVersion, platform);
    if (!manifest) {
      // 该 runtimeVersion 尚无更新 → 404，客户端保持运行内置/已缓存的版本（不视为错误）。
      return reply.code(404).send({ error: "no update available" });
    }

    const manifestString = JSON.stringify(manifest);
    const boundary = `expo-boundary-${manifest.id}`;
    const partHeaders = [
      'Content-Disposition: form-data; name="manifest"',
      "Content-Type: application/json; charset=utf-8",
    ];
    if (wantsSignature) {
      if (!cfg.privateKeyPem) {
        // 客户端要求验签但服务端没配私钥 → 明确报错，别让客户端拿到不带签名的包被拒后静默不更新。
        return reply.code(500).send({ error: "服务端未配置代码签名私钥，但客户端要求验签" });
      }
      partHeaders.push(`expo-signature: ${signManifest(manifestString, cfg.privateKeyPem, cfg.keyid)}`);
    }
    const body =
      `--${boundary}\r\n` +
      partHeaders.join("\r\n") +
      `\r\n\r\n` +
      manifestString +
      `\r\n--${boundary}--\r\n`;

    return reply
      .header("expo-protocol-version", "1")
      .header("expo-sfv-version", "0")
      .header("cache-control", "private, max-age=0")
      .header("content-type", `multipart/mixed; boundary=${boundary}`)
      .send(body);
  };

  // ⚠️ 已安装设备包里的 updates.url 路径是烤死的、改不了。历史上出现过 /manifest、/manifest.json，
  // 现配的是 /api/manifest——三条都注册到同一 handler，让旧包（请求 /manifest）也能拿到更新，无需重装。
  for (const p of ["/api/manifest", "/manifest", "/manifest.json"]) app.get(p, manifestHandler);

  app.get<{ Params: { rv: string; folder: string; "*": string } }>(
    "/assets/:rv/:folder/*",
    async (req, reply) => {
      const { rv, folder } = req.params;
      const rel = req.params["*"];
      const bytes = await store.readAsset(rv, folder, rel);
      if (!bytes) return reply.code(404).send({ error: "asset not found" });
      const ext = rel.split(".").pop() ?? "";
      return reply.header("content-type", contentTypeForExt(ext)).send(bytes);
    },
  );

  return app;
}
