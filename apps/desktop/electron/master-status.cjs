// Electron 主进程与 vitest 共用的 master stdout/stderr 状态聚合器。
// 只做纯字符串/状态转换，不依赖 Electron；解析契约与 services/master/src/run.ts 的稳定状态行同步。

const ANSI_RE = /\u001B\[[0-?]*[ -/]*[@-~]/g;
const SUBNET_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;

function cleanLine(value) {
  return String(value).replace(ANSI_RE, "").trim();
}

function parseSubnets(value) {
  const found = [];
  for (const token of String(value).split(/[\s,;/]+/)) {
    const subnet = token.trim().replace(/\.1-254$/i, "").replace(/\.x$/i, "");
    const valid =
      SUBNET_RE.test(subnet) &&
      subnet.split(".").every((part) => Number.isInteger(Number(part)) && Number(part) >= 0 && Number(part) <= 255);
    if (valid && !found.includes(subnet)) found.push(subnet);
  }
  return found;
}

function createMasterStatusTracker(options = {}) {
  const now = options.now || Date.now;
  const onChange = options.onChange;
  let state = {
    running: false,
    restarting: false,
    pid: null,
    vlmUrl: "",
    subnets: [],
    lastScanAt: null,
    discoveredCount: 0,
    onlineCount: 0,
    lastError: null,
  };
  let stdoutBuffer = "";
  let stderrBuffer = "";
  let lastEmitted = "";
  let explicitScanReported = false;
  const scanHosts = new Set();
  const onlineIds = new Set();

  const snapshot = () => ({ ...state, subnets: [...state.subnets] });

  function emit() {
    if (!onChange) return;
    const next = snapshot();
    const serialized = JSON.stringify(next);
    if (serialized === lastEmitted) return;
    lastEmitted = serialized;
    onChange(next);
  }

  function patch(next) {
    const merged = { ...state, ...next };
    if (next.subnets) merged.subnets = [...next.subnets];
    if (JSON.stringify(merged) === JSON.stringify(state)) return;
    state = merged;
    emit();
  }

  function resetSession(info, restarting) {
    stdoutBuffer = "";
    stderrBuffer = "";
    explicitScanReported = false;
    scanHosts.clear();
    onlineIds.clear();
    state = {
      running: false,
      restarting,
      pid: null,
      vlmUrl: cleanLine(info?.vlmUrl || ""),
      subnets: parseSubnets(info?.subnets || ""),
      lastScanAt: null,
      discoveredCount: 0,
      onlineCount: 0,
      lastError: null,
    };
    emit();
  }

  function rememberError(line) {
    const message = cleanLine(line).slice(0, 1000);
    if (message) patch({ lastError: message });
  }

  function parseLine(stream, rawLine) {
    const line = cleanLine(rawLine);
    if (!line) return;

    const scanStart = line.match(/自动发现:扫\s+(.+?)\s+的\s+:8100/i);
    if (scanStart) {
      const subnets = parseSubnets(scanStart[1]);
      scanHosts.clear();
      if (subnets.length > 0) patch({ subnets });
    }

    const recurring = line.match(/持续发现:每.+?重扫\s+(.+?),新手机/i);
    if (recurring) {
      const subnets = parseSubnets(recurring[1]);
      if (subnets.length > 0) patch({ subnets });
    }

    const vlm = line.match(/;\s*VLM\s+(\S+)\s+\(/i);
    if (vlm) patch({ vlmUrl: vlm[1] });

    const foundHost = line.match(/发现手机\s+([^\s:]+):\d+/);
    if (foundHost) {
      scanHosts.add(foundHost[1]);
      patch({ discoveredCount: scanHosts.size });
    }

    const scanComplete = line.match(/自动发现:(?:扫描完成|重扫完成),发现\s*(\d+)\s*台/);
    if (scanComplete) {
      explicitScanReported = true;
      patch({ discoveredCount: Number(scanComplete[1]), lastScanAt: now() });
    } else {
      // 兼容尚未输出“扫描完成”行的旧 master。
      const merged = line.match(/自动发现:合并配置后共\s*(\d+)\s*台/);
      if (merged && !explicitScanReported) {
        patch({ discoveredCount: Number(merged[1]), lastScanAt: now() });
      }
    }

    const online = line.match(/\+\s*上线\s+([^\s(]+)/);
    if (online) {
      onlineIds.add(online[1]);
      patch({ onlineCount: Math.max(state.onlineCount, onlineIds.size) });
    }
    const onlineSummary = line.match(/已上线\s*(\d+)\s*台/);
    if (onlineSummary) patch({ onlineCount: Number(onlineSummary[1]) });

    if (/重扫失败:/.test(line)) patch({ lastScanAt: now() });
    const semanticError =
      /(?:启动失败|重扫失败|装配失败|自动发现:未找到|不可达|错误|\berror\b|«(?:batch_error|alert)»)/i.test(line);
    const stderrWrapperNoise =
      /(?:warning|^\s*at\s|^Node\.js v|ELIFECYCLE|^\s*(?:npm|pnpm)\s+warn\b)/i.test(line);
    if (semanticError || (stream === "stderr" && !stderrWrapperNoise)) {
      rememberError(line);
    }
  }

  function ingest(stream, chunk) {
    const key = stream === "stderr" ? "stderr" : "stdout";
    let buffer = (key === "stderr" ? stderrBuffer : stdoutBuffer) + String(chunk);
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    if (key === "stderr") stderrBuffer = buffer;
    else stdoutBuffer = buffer;
    for (const line of lines) parseLine(key, line);
  }

  function flush() {
    if (stdoutBuffer) parseLine("stdout", stdoutBuffer);
    if (stderrBuffer) parseLine("stderr", stderrBuffer);
    stdoutBuffer = "";
    stderrBuffer = "";
  }

  return {
    snapshot,
    beginStart(info = {}) {
      resetSession(info, true);
    },
    markRunning(pid) {
      patch({ running: true, restarting: false, pid: Number.isInteger(pid) ? pid : null });
    },
    markStopped({ intentional = false, code = null, signal = null } = {}) {
      flush();
      const next = { running: false, restarting: false, pid: null };
      if (!intentional && !state.lastError) {
        const detail = signal ? `signal ${signal}` : `code ${code ?? "unknown"}`;
        next.lastError = `master 意外退出（${detail}）`;
      }
      patch(next);
    },
    markFailed(error) {
      flush();
      patch({
        running: false,
        restarting: false,
        pid: null,
        lastError: cleanLine(error instanceof Error ? error.message : error).slice(0, 1000) || "master 启动失败",
      });
    },
    ingest,
  };
}

module.exports = { createMasterStatusTracker, parseSubnets };
