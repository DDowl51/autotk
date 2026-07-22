import Fastify, { type FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { buildEnrollProfile, parseDeviceAttributes } from "../core/enroll-profile";
import type { SigningOrchestrator } from "../core/signing-orchestrator";
import type { OtaStore } from "../adapters/ota-store";
import { renderLanding } from "./landing";
import type { TrackFn } from "../adapters/telemetry";

export interface OtaHttpConfig {
  /** https 源，无结尾斜杠。 */
  baseUrl: string;
  /** 描述文件里的组织名。 */
  organization: string;
  /** 采集描述文件标识（reverse-dns）。 */
  enrollIdentifier: string;
  /** 各 App 展示信息 + 白名单（键须与 orchestrator 的 apps 一致）。 */
  apps: Record<string, { title: string }>;
}

export interface OtaHttpDeps {
  orchestrator: SigningOrchestrator;
  store: OtaStore;
  config: OtaHttpConfig;
  /** 把设备 POST 的 body 解成 plist 文本。默认透传（适配器注入 PKCS#7 解签）。 */
  extractDevicePlist?: (body: Buffer) => string | Promise<string>;
  /** PayloadUUID 生成器（测试可注入确定值）。 */
  uuid?: () => string;
  /** 给采集描述文件加签（显示「已验证」）。不传则下发未签名 XML。 */
  signMobileconfig?: (unsignedXml: string) => Promise<Buffer>;
  /** 埋点。不传则 no-op。 */
  track?: TrackFn;
}

/**
 * 装机服务的 HTTP 层（Fastify）。路由见 docs/plan.md 第 3 节。
 * 不在这里 listen —— 返回 app，由 main.ts 决定端口/反代。
 */
export function buildOtaApp(deps: OtaHttpDeps): FastifyInstance {
  const { orchestrator, store, config } = deps;
  const extract = deps.extractDevicePlist ?? ((b: Buffer) => b.toString("utf8"));
  const uuid = deps.uuid ?? randomUUID;
  const track: TrackFn = deps.track ?? (() => {});
  const knownApp = (a: string): boolean => Object.prototype.hasOwnProperty.call(config.apps, a);

  const app = Fastify({ logger: false });
  // 设备回传是 plist/PKCS#7，非 JSON：原始 body 收成 Buffer。
  app.addContentTypeParser("*", { parseAs: "buffer" }, (_req, body, done) => done(null, body));

  // 落地页：扫码入口，建一个 session 串联后续。
  app.get<{ Params: { app: string } }>("/ota/:app", async (req, reply) => {
    const appKey = req.params.app;
    if (!knownApp(appKey)) return reply.code(404).type("text/plain").send("unknown app");
    const session = store.createSession(appKey);
    track("ota_scan", { app: appKey });
    return reply
      .type("text/html; charset=utf-8")
      .send(renderLanding({ app: appKey, title: config.apps[appKey].title, session, baseUrl: config.baseUrl }));
  });

  // 采集描述文件：回调地址带上 session + app。
  app.get<{ Params: { app: string }; Querystring: { s?: string } }>(
    "/ota/:app/enroll.mobileconfig",
    async (req, reply) => {
      const appKey = req.params.app;
      const s = req.query.s;
      if (!knownApp(appKey) || !s) return reply.code(400).type("text/plain").send("bad request");
      const callbackUrl = `${config.baseUrl}/ota/enroll-callback?s=${encodeURIComponent(s)}&app=${encodeURIComponent(appKey)}`;
      const xml = buildEnrollProfile({
        callbackUrl,
        organization: config.organization,
        identifier: config.enrollIdentifier,
        uuid: uuid(),
      });
      const payload = deps.signMobileconfig ? await deps.signMobileconfig(xml) : xml;
      return reply
        .type("application/x-apple-aspen-config; charset=utf-8")
        .header("Content-Disposition", "attachment; filename=enroll.mobileconfig")
        .send(payload);
    },
  );

  // 设备回传 UDID → 跑编排 → 更新 session 状态。设备端回跳靠落地页轮询兜底。
  app.post<{ Querystring: { s?: string; app?: string } }>("/ota/enroll-callback", async (req, reply) => {
    const s = req.query.s;
    const appKey = req.query.app;
    if (!s || !appKey || !knownApp(appKey)) return reply.code(400).type("text/plain").send("bad request");
    try {
      const plistText = await extract(req.body as Buffer);
      const dev = parseDeviceAttributes(plistText);
      console.log(`[enroll] app=${appKey} udid=${dev.udid} name=${dev.deviceName ?? "?"}`);
      const outcome = await orchestrator.enroll(appKey, dev.udid, dev.deviceName);
      if (outcome.state === "ready") {
        console.log(`[enroll] → ready account=${outcome.account} 新设备=${outcome.registeredNewDevice} 重签=${outcome.resigned}`);
        store.markReady(s, outcome);
        track("ota_enroll", {
          app: appKey,
          account: outcome.account,
          newDevice: outcome.registeredNewDevice,
        });
        if (outcome.resigned) track("ota_sign", { app: appKey, account: outcome.account });
      } else if (outcome.state === "processing") {
        console.log(`[enroll] → Apple 处理中（PROCESSING）account=${outcome.account} app=${appKey}`);
        store.markProcessing(s);
        track("ota_processing", { app: appKey });
      } else {
        console.log(`[enroll] → 账号池已满 app=${appKey}`);
        store.markPoolFull(s);
        track("ota_pool_full", { app: appKey });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[enroll] ✗ 出错 app=${appKey}：${msg}`);
      store.markError(s, msg);
      track("ota_error", { app: appKey });
    }
    return reply.code(200).type("text/plain").send("");
  });

  // 落地页轮询。
  app.get<{ Querystring: { s?: string } }>("/ota/:app/status", async (req, reply) => {
    const s = req.query.s;
    const sess = s ? store.getSession(s) : undefined;
    if (!sess) return reply.code(404).send({ state: "unknown" });
    return reply.send({ state: sess.state, error: sess.error });
  });

  // per-session manifest（仅 ready 后可取）。
  app.get<{ Querystring: { s?: string } }>("/ota/:app/manifest.plist", async (req, reply) => {
    const s = req.query.s;
    const sess = s ? store.getSession(s) : undefined;
    if (!sess || sess.state !== "ready" || !sess.ready) return reply.code(404).type("text/plain").send("not ready");
    return reply.type("text/xml; charset=utf-8").send(sess.ready.manifestXml);
  });

  // 签名 IPA 字节。
  app.get<{ Params: { token: string } }>("/ota/ipa/:token", async (req, reply) => {
    const bytes = store.getIpa(req.params.token);
    if (!bytes) return reply.code(404).type("text/plain").send("not found");
    return reply
      .type("application/octet-stream")
      .header("Content-Disposition", "attachment; filename=app.ipa")
      .send(bytes);
  });

  return app;
}
