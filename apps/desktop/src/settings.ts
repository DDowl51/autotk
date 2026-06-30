export interface AppSettings {
  hubUrl: string;
  videoRoot: string; // 阶段 3 视频根文件夹（操作员本地路径）
  stalledMinutes: number; // 「疑似卡住」阈值（分钟）
  accent: string; // 主题色（信号色）
  collectorUrl: string; // 埋点采集服务地址（数据看板用）
}

const KEY = "mc.settings";
const DEFAULTS: AppSettings = {
  hubUrl: "http://localhost:4000",
  videoRoot: "",
  stalledMinutes: 5,
  accent: "#c5f23f",
  collectorUrl: "",
};

/** 纯函数：把存储的原始字符串解析成设置（含默认值兜底、坏数据容错）。可单测。 */
export function parseSettings(raw: string | null): AppSettings {
  if (raw) {
    try {
      const obj = JSON.parse(raw) as Partial<AppSettings>;
      return { ...DEFAULTS, ...obj };
    } catch {
      // 坏数据 → 默认
    }
  }
  return { ...DEFAULTS };
}

function safeGet(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function loadSettings(): AppSettings {
  return parseSettings(safeGet());
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...loadSettings(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // 忽略（隐私模式等）
  }
  return next;
}
