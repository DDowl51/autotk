/**
 * 电脑驱动调试台。在 Linux 上运行，连接手机 WDA(:8100) 操控 TikTok。
 *
 * 用法（先编译再运行，见 package.json 的 "wda" 脚本）：
 *   WDA_URL=http://<手机IP>:8100 npm run wda -- <命令> [参数]
 *
 * 命令：
 *   status                 查询 WDA 状态
 *   probe [文件名]          抓取当前界面元素树，存到 adaptation/element-trees/
 *   shot  [文件名]          截图存到 adaptation/screenshots/
 *   foryou                 切到推荐页
 *   caption                读取当前视频文案
 *   like | save | follow   对当前视频点赞 / 收藏 / 关注
 *   comment                打开评论区
 *   swipe                  上滑下一个视频
 *   run [params.json]      连续运行引擎（默认推荐页养号配置；可传 legacy 参数 JSON）
 */
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import {
  activateApp,
  applyFastSettings,
  createSession,
  alertText,
  alertButtons,
  alertClickButton,
  alertDismiss,
  deleteSession,
  getSessionId,
  getSettings,
  updateSettings,
  screenshot,
  setBaseUrl,
  source,
  status,
  swipe,
  tap,
  touchTap,
  typeText,
  setTimeout_,
  windowSize,
  TIKTOK_BUNDLE_ID,
  type Point,
} from "../src/wda";
import {
  detectRail,
  detectFollow,
  detectCommentHearts,
  detectSendButton,
  detectCommentCloseButton,
} from "./railDetect";
import { createCalibratedUI } from "./calibratedUI";
import { readCaption, terminateOcr } from "./ocr";
import {
  deviceKey,
  loadProfile,
  saveProfile,
  DEVICES_FILE,
  type DeviceProfile,
} from "./deviceProfile";
import { createWdaUI } from "../src/engine/wdaUI";
import { createEngine } from "../src/engine";
import { createFixedReplyGenerator } from "../src/gen";
import { chooseAlertButton } from "../src/engine/alertIntent";
import {
  DEFAULT_PARAMS,
  fromLegacy,
  validateParams,
  type AutomationParams,
  type LegacyParams,
} from "../src/params";

const ROOT = path.resolve(__dirname, "..", "..", ".."); // tools/dist/tools -> 项目根
const ADAPT_DIR = path.join(ROOT, "adaptation");

function log(msg: string) {
  console.log(`${new Date().toLocaleTimeString()}  ${msg}`);
}

function resolveUrl(): string {
  const fromArg = process.argv.find((a) => a.startsWith("--url="));
  const url = fromArg ? fromArg.slice("--url=".length) : process.env.WDA_URL;
  if (!url) {
    console.error("缺少 WDA 地址。请设置 WDA_URL=http://<手机IP>:8100 或传 --url=");
    process.exit(1);
  }
  return url;
}

/** run 命令的默认配置：仅推荐页养号，不做评论/搜索/主页（尚未适配）。 */
function defaultRunParams(): AutomationParams {
  return {
    ...DEFAULT_PARAMS,
    posPrompts: ["*"], // 命中所有视频，便于观察互动（实战换成对标词）
    kwSearchExecRatio: 0, // 默认只跑推荐页；搜索拉粉请传 params.json 开启
    forYou: {
      ...DEFAULT_PARAMS.forYou,
      interactEnable: true, // 进评论区给评论点赞
      interactProb: 0.4,
      commentReplyMaxCount: 0, // 默认不发回复（评论密度有风控风险），营销再开
    },
    persHome: { ...DEFAULT_PARAMS.persHome, moduleEnable: false },
    taskWindows: [{ start: "00:00:00", end: "23:59:59" }],
  };
}

/** 确保有会话并把 TikTok 切前台（已有会话则不重建，避免重启 TikTok）。 */
async function ensureTikTok() {
  if (!getSessionId()) {
    await createSession();
    await applyFastSettings();
  }
  await activateApp(TIKTOK_BUNDLE_ID);
}

/** 仅确保有会话，不切换/重启任何 app（截图用，截图是无会话端点）。 */
async function ensureSession() {
  if (!getSessionId()) {
    await createSession();
    await applyFastSettings();
  }
}

async function main() {
  setBaseUrl(resolveUrl());
  // 默认单次请求 20s 超时，避免卡到 fetch 默认的 5 分钟。可用 --timeout=秒 调整。
  const tArg = process.argv.find((a) => a.startsWith("--timeout="));
  setTimeout_(tArg ? Number(tArg.slice("--timeout=".length)) * 1000 : 20000);
  const cmd = process.argv[2];
  const arg = process.argv[3];
  const ui = createWdaUI(log);

  if (cmd === "repl" || !cmd) {
    await repl(ui);
    return;
  }

  try {
    await dispatch(cmd, arg, ui);
  } finally {
    // 用完销毁会话，避免在 WDA 端越积越多拖垮它。
    await deleteSession().catch(() => {});
    await terminateOcr().catch(() => {});
  }
}

/**
 * 交互式 REPL：启动时建一次会话并保持热，之后逐条命令立即执行，
 * 不再重新编译、不再重建会话——这是开发期最快的迭代方式。
 */
async function repl(ui: ReturnType<typeof createWdaUI>) {
  // 预热：只建会话 + 激活 TikTok（不抓元素树、不切推荐页），后续命令复用同一会话。
  log("预热中：建立 WDA 会话…");
  const t0 = Date.now();
  try {
    await createSession();
    const applied = await applyFastSettings();
    log(
      `已应用提速设置：waitForIdleTimeout=${applied.waitForIdleTimeout}, ` +
        `animationCoolOffTimeout=${applied.animationCoolOffTimeout}, ` +
        `snapshotMaxDepth=${applied.snapshotMaxDepth}`,
    );
    await activateApp(TIKTOK_BUNDLE_ID);
    log(`会话就绪（${((Date.now() - t0) / 1000).toFixed(1)}s）`);
  } catch (e) {
    log(`预热失败：${e instanceof Error ? e.message : e}`);
  }
  log("就绪。输入命令（help 查看，exit 退出）：");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.setPrompt("wda> ");
  rl.prompt();

  rl.on("line", async (line) => {
    const trimmed = line.trim();
    const sp = trimmed.indexOf(" ");
    const c = sp === -1 ? trimmed : trimmed.slice(0, sp);
    const a = sp === -1 ? undefined : trimmed.slice(sp + 1).trim();
    if (!c) return rl.prompt();
    if (c === "exit" || c === "quit") return rl.close();
    const t0 = Date.now();
    try {
      await dispatch(c, a, ui);
    } catch (e) {
      log(`出错：${e instanceof Error ? e.message : e}`);
    }
    log(`(${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    rl.prompt();
  });

  await new Promise<void>((resolve) => {
    rl.on("close", async () => {
      await deleteSession().catch(() => {});
      await terminateOcr().catch(() => {});
      log("已退出，会话已清理。");
      resolve();
    });
  });
}

async function dispatch(
  cmd: string,
  arg: string | undefined,
  ui: ReturnType<typeof createWdaUI>,
) {
  switch (cmd) {
    case "status": {
      const s = await status();
      log(`WDA 就绪：${JSON.stringify(s)}`);
      break;
    }
    case "settings": {
      // 读取当前生效的 WDA settings，确认提速设置是否真的应用了。
      if (!getSessionId()) {
        await createSession();
        await applyFastSettings();
      }
      const s = await getSettings();
      log(`当前 settings：${JSON.stringify(s)}`);
      break;
    }
    case "set": {
      // 实时改一个设置并重试。用法：set snapshotMaxDepth 2
      if (!getSessionId()) {
        await createSession();
        await applyFastSettings();
      }
      const [key, valRaw] = (arg ?? "").split(/\s+/, 2);
      if (!key || valRaw === undefined) {
        log("用法：set <key> <value>（如 set snapshotMaxDepth 2）");
        break;
      }
      const val = /^-?\d+(\.\d+)?$/.test(valRaw)
        ? Number(valRaw)
        : valRaw === "true"
          ? true
          : valRaw === "false"
            ? false
            : valRaw;
      const updated = await updateSettings({ [key]: val });
      log(`已设置 ${key}=${JSON.stringify(updated[key])}`);
      break;
    }
    case "probe": {
      await ensureTikTok();
      const xml = await source();
      const dir = path.join(ADAPT_DIR, "element-trees");
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, arg ?? `capture-${Date.now()}.xml`);
      fs.writeFileSync(file, xml);
      log(`已保存元素树（${xml.length} 字符）→ ${file}`);
      break;
    }
    case "shot": {
      await ensureSession(); // 不切换 app，截当前界面
      const b64 = await screenshot();
      const dir = path.join(ADAPT_DIR, "screenshots");
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, arg ?? `shot-${Date.now()}.png`);
      fs.writeFileSync(file, Buffer.from(b64, "base64"));
      log(`已保存截图 → ${file}`);
      break;
    }
    case "snap": {
      // 仅测「抓一次元素树」的耗时，定位慢点用。
      if (!getSessionId()) {
        await createSession();
        await activateApp(TIKTOK_BUNDLE_ID);
      }
      const t = Date.now();
      const xml = await source();
      log(`抓取元素树：${xml.length} 字符，${((Date.now() - t) / 1000).toFixed(1)}s`);
      break;
    }
    case "rawtap":
    case "rawhtap": {
      // 不 activate 任何 app，直接在当前前台界面点坐标。用于排查 WDA 点击通道本身是否健康。
      // 建议先手动停在 iOS 主屏幕再测。用法：rawtap 195,400
      if (!getSessionId()) await createSession();
      const [x, y] = (arg ?? "").split(",").map(Number);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        log(`用法：${cmd} x,y`);
        break;
      }
      await (cmd === "rawhtap" ? touchTap({ x, y }) : tap({ x, y }));
      log(`已点击 (${x}, ${y})，未切换 app`);
      break;
    }
    case "tap":
    case "htap": {
      // 直接点固定坐标，不抓元素树。tap=W3C /actions，htap=/wda/touch/perform。
      if (!getSessionId()) {
        await createSession();
        await activateApp(TIKTOK_BUNDLE_ID);
      }
      const [x, y] = (arg ?? "").split(",").map(Number);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        log(`用法：${cmd} x,y（如 ${cmd} 357,430）`);
        break;
      }
      await (cmd === "htap" ? touchTap({ x, y }) : tap({ x, y }));
      log(`已点击 (${x}, ${y}) via ${cmd === "htap" ? "touch/perform" : "actions"}`);
      break;
    }
    case "xlike":
    case "xsave":
    case "xcomment":
    case "hlike":
    case "hsave":
    case "hcomment": {
      // 纯坐标点击（不抓元素树），坐标取自 390×844 机型。
      // x* 用 W3C /actions，h* 用 /wda/touch/perform。
      if (!getSessionId()) {
        await createSession();
        await activateApp(TIKTOK_BUNDLE_ID);
      }
      const coords: Record<string, Point> = {
        like: { x: 357, y: 430 },
        save: { x: 357, y: 562 },
        comment: { x: 347, y: 496 },
      };
      const useTouch = cmd.startsWith("h");
      const p = coords[cmd.slice(1)];
      await (useTouch ? touchTap(p) : tap(p));
      log(`已点击 ${cmd} (${p.x}, ${p.y}) via ${useTouch ? "touch/perform" : "actions"}`);
      break;
    }
    case "detect": {
      // 截图检测右栏四个图标坐标，只打印不点击（用于核对）。
      await ensureTikTok();
      const { width, height } = await windowSize();
      const r = await detectRail(width, height);
      log(
        `检测到图标: 点赞(${r.like.x.toFixed(0)},${r.like.y.toFixed(0)}) ` +
          `评论(${r.comment.x.toFixed(0)},${r.comment.y.toFixed(0)}) ` +
          `收藏(${r.save.x.toFixed(0)},${r.save.y.toFixed(0)}) ` +
          `分享(${r.share.x.toFixed(0)},${r.share.y.toFixed(0)}) ` +
          `关注(${r.follow ? `${r.follow.x.toFixed(0)},${r.follow.y.toFixed(0)}` : "未检测到"})`,
      );
      break;
    }
    case "alert": {
      // 读当前 iOS 系统弹窗的文字+按钮+将点的按钮；`alert go` 真的关掉。
      await ensureSession();
      const text = await alertText();
      if (text === null) {
        log("当前无系统弹窗");
        break;
      }
      const buttons = await alertButtons();
      const choice = chooseAlertButton(text, buttons);
      log(`弹窗文字：${text}`);
      log(`按钮：${buttons.join(" | ") || "(读不到)"}`);
      log(`意图：将点「${"label" in choice ? choice.label : "dismiss(默认取消)"}」`);
      if (arg === "go") {
        if ("label" in choice) await alertClickButton(choice.label);
        else await alertDismiss();
        log("已处理");
      } else {
        log("（加 `alert go` 真的关掉）");
      }
      break;
    }
    case "whereami": {
      // 判断当前页面是不是"已知/正常"页（视频流/评论区），用于验证脱困判定。
      await ensureTikTok();
      const { width, height } = await windowSize();
      let where = "未知页面（recoverIfLost 会左滑返回）";
      if (await detectCommentCloseButton(width, height)) {
        where = "评论区（有关闭✕）";
      } else {
        try {
          await detectRail(width, height);
          where = "视频流（有动作栏）";
        } catch {
          /* 无动作栏 */
        }
      }
      log(`当前页面判定：${where}`);
      break;
    }
    case "swipeback": {
      await ensureTikTok();
      const { width, height } = await windowSize();
      await swipe({ x: 3, y: height * 0.5 }, { x: width * 0.78, y: height * 0.5 }, 0.2);
      log("已左滑返回");
      break;
    }
    case "calibrate": {
      // 在干净的未点赞视频上检测一次 → 存进 devices.json（按逻辑分辨率归类）。
      await ensureTikTok();
      const { width, height } = await windowSize();
      const r = await detectRail(width, height);
      const prof: DeviceProfile = { screen: { w: width, h: height }, ...r };
      const key = deviceKey(width, height);
      saveProfile(key, prof);
      log(`已标定 [${key}] 并保存 → ${DEVICES_FILE}`);
      log(`  点赞(${r.like.x.toFixed(0)},${r.like.y.toFixed(0)}) 评论(${r.comment.x.toFixed(0)},${r.comment.y.toFixed(0)}) 收藏(${r.save.x.toFixed(0)},${r.save.y.toFixed(0)}) 分享(${r.share.x.toFixed(0)},${r.share.y.toFixed(0)}) 关注(${r.follow ? `${r.follow.x.toFixed(0)},${r.follow.y.toFixed(0)}` : "未检测到"})`);
      break;
    }
    case "like":
    case "save":
    case "comment":
    case "share": {
      // 运行时直接用标定好的坐标点击（快、不受图标变色影响）。
      await ensureTikTok();
      const { width, height } = await windowSize();
      const prof = loadProfile(deviceKey(width, height));
      if (!prof) {
        log(`本机型 [${deviceKey(width, height)}] 未标定，请先在干净视频上执行 calibrate`);
        break;
      }
      const p = prof[cmd];
      await tap(p);
      log(`已点击 ${cmd} (${p.x.toFixed(0)}, ${p.y.toFixed(0)})`);
      break;
    }
    case "follow": {
      // 关注前先实时检测红 + 是否存在：在才点，避免点到已关注作者的头像而跳转主页。
      await ensureTikTok();
      const { width, height } = await windowSize();
      const prof = loadProfile(deviceKey(width, height));
      if (!prof) {
        log(`本机型 [${deviceKey(width, height)}] 未标定，请先 calibrate`);
        break;
      }
      const f = await detectFollow(width, height, prof.like.y);
      if (!f) {
        log("未检测到关注按钮（已关注或无按钮），跳过");
        break;
      }
      await tap(f);
      log(`已关注 (${f.x.toFixed(0)}, ${f.y.toFixed(0)})`);
      break;
    }
    case "chearts": {
      // 检测评论区爱心位置，只打印不点击（需先打开评论区）。
      await ensureTikTok();
      const { width, height } = await windowSize();
      const hs = await detectCommentHearts(width, height);
      log(`检测到 ${hs.length} 个评论爱心: ${hs.map((p) => `(${p.x.toFixed(0)},${p.y.toFixed(0)})`).join(" ")}`);
      break;
    }
    case "likecomments": {
      // 检测评论区爱心 → 给前 n 条点赞（默认 3）。需先打开评论区。
      await ensureTikTok();
      const { width, height } = await windowSize();
      const hs = await detectCommentHearts(width, height);
      const n = Math.min(hs.length, arg ? Number(arg) : 3);
      log(`给 ${n}/${hs.length} 条评论点赞…`);
      for (let i = 0; i < n; i++) {
        await tap(hs[i]);
        log(`  已赞评论 ${i + 1} (${hs[i].x.toFixed(0)},${hs[i].y.toFixed(0)})`);
        await new Promise((r) => setTimeout(r, 600));
      }
      break;
    }
    case "tapinput": {
      // 点击底部"Add comment"输入框使其聚焦（评论区需已打开）。
      await ensureTikTok();
      const { width, height } = await windowSize();
      const p = { x: width * 0.28, y: height * 0.944 };
      await tap(p);
      log(`已点击输入框 (${p.x.toFixed(0)},${p.y.toFixed(0)})，键盘应弹出`);
      break;
    }
    case "type": {
      // 向当前聚焦的输入框打字。用法：type 你好
      if (!arg) {
        log("用法：type <文本>");
        break;
      }
      await ensureSession();
      await typeText(arg);
      log(`已输入：${arg}`);
      break;
    }
    case "reply": {
      // 在视频下发一条评论：点输入框 → 打字 → 检测红色发送按钮 → 发送。
      // 需先打开评论区。用法：reply 文本
      if (!arg) {
        log("用法：reply <文本>");
        break;
      }
      await ensureTikTok();
      const { width, height } = await windowSize();
      await tap({ x: width * 0.28, y: height * 0.944 }); // 聚焦输入框
      await new Promise((r) => setTimeout(r, 800));
      await typeText(arg);
      await new Promise((r) => setTimeout(r, 600));
      const send = await detectSendButton(width, height);
      if (!send) {
        log("未检测到发送按钮（可能没输入成功/键盘未弹出）");
        break;
      }
      await tap(send);
      log(`已发送评论：${arg}  (发送键 ${send.x.toFixed(0)},${send.y.toFixed(0)})`);
      break;
    }
    case "closecomments": {
      // 检测面板顶部 → 点右上角 ✕ 关闭（比下滑稳，下滑在长列表里只会滚动）。
      await ensureTikTok();
      const { width, height } = await windowSize();
      const x = await detectCommentCloseButton(width, height);
      if (x) {
        await tap(x);
        log(`已点 ✕ 关闭评论区 (${x.x.toFixed(0)},${x.y.toFixed(0)})`);
      } else {
        await swipe({ x: width * 0.5, y: height * 0.3 }, { x: width * 0.5, y: height * 0.95 }, 0.3);
        log("未检测到 ✕，改用下滑关闭");
      }
      break;
    }
    case "searchopen": {
      // 点右上角放大镜，打开搜索页（搜索框通常自动聚焦、弹键盘）。
      await ensureTikTok();
      const { width } = await windowSize();
      await tap({ x: width - 28, y: 69 });
      log("已点击搜索放大镜");
      break;
    }
    case "searchtype": {
      // 在已打开的搜索框里打字（不提交）。用法：searchtype bikini
      if (!arg) {
        log("用法：searchtype <关键词>");
        break;
      }
      await ensureSession();
      await typeText(arg);
      log(`已输入搜索词：${arg}`);
      break;
    }
    case "search": {
      // 完整搜索：放大镜 → 打字 → 提交 → 打开第一个结果（进入可上滑的结果视频流）。
      if (!arg) {
        log("用法：search <关键词>");
        break;
      }
      await ensureTikTok();
      const { width: W, height: H } = await windowSize();
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
      await tap({ x: W - 28, y: 69 }); // 放大镜
      await wait(1000);
      await typeText(arg);
      await wait(700);
      await tap({ x: W - 43, y: 69 }); // 红色 Search 提交
      await wait(10000); // 等结果加载（网络慢时缩略图未就绪会点空，故留足时间）
      await tap({ x: W * 0.25, y: H * 0.255 }); // 第一个结果缩略图
      await wait(1500);
      log(`已搜索「${arg}」并打开第一个结果（之后可用 like/save/follow/comment/swipe 互动）`);
      break;
    }
    case "foryou":
      await ui.openForYou();
      break;
    case "caption": {
      // OCR 读取当前视频文案。
      await ensureTikTok();
      const { width, height } = await windowSize();
      const cap = await readCaption(width, height);
      log(cap ? `文案：${cap}` : "未识别到文案");
      break;
    }
    case "swipe":
      await ui.swipeToNextVideo();
      break;
    case "run": {
      let params = defaultRunParams();
      if (arg) {
        const raw = JSON.parse(fs.readFileSync(arg, "utf8")) as LegacyParams;
        params = fromLegacy(raw);
      }
      const errors = validateParams(params);
      if (errors.length) {
        console.error("参数校验失败：\n" + errors.join("\n"));
        process.exit(1);
      }
      const engine = createEngine({
        params,
        ui: createCalibratedUI(log), // 用标定坐标驱动，快且稳
        gen: createFixedReplyGenerator(params.fixedReplies),
        logger: { log: (_lvl, m) => log(m) },
      });
      process.on("SIGINT", () => {
        log("收到中断，停止引擎…");
        engine.stop();
        setTimeout(() => process.exit(0), 1500);
      });
      log("引擎启动（Ctrl+C 停止）");
      await engine.start();
      break;
    }
    case "help":
    default:
      console.log(
        "命令：\n" +
          "  计时诊断: snap（抓元素树耗时）\n" +
          "  标定: calibrate(干净视频上检测并存档) | detect(只看不存)\n" +
          "  动作(读标定坐标): like | save | comment | share | follow\n" +
          "  评论区(运行时检测): chearts | likecomments [n] | closecomments\n" +
          "  发评论: tapinput | type <文本> | reply <文本>\n" +
          "  搜索: search <关键词>(搜索并打开第一个结果) | searchopen | searchtype\n" +
          "  纯坐标点击(调试): tap/htap x,y | xlike | xsave | xcomment\n" +
          "  元素树驱动(TikTok 上慢): foryou | caption | follow | swipe\n" +
          "  其他: status | probe [文件] | shot [文件] | run [params.json] | exit",
      );
  }
}

main().catch((e) => {
  console.error("出错：", e instanceof Error ? e.message : e);
  process.exit(1);
});
