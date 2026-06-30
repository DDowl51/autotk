import { theme as antdTheme, type ThemeConfig } from "antd";

// ——— Signal Deck ———
// 暗色「信号控制台」：深墨底 + 电光柠檬(lime)信号色（运行中=活体信号），
// 青/琥珀/珊瑚分担在线/警示/告警。Bricolage Grotesque 显示体 + JetBrains Mono 数据体。

export const C = {
  ink: "#0a0c11",
  ink2: "#0c0f15",
  panel: "#12161e",
  panel2: "#161c26",
  line: "#242c3a",
  lineSoft: "#1a212c",
  text: "#eaf0f7",
  dim: "#93a1b3",
  faint: "#5c6776",
  lime: "#c5f23f", // 主信号
  limeDeep: "#9bd424",
  cyan: "#5ad6e0", // 在线（空闲）
  amber: "#f6b53e", // 警示/疑似卡住
  coral: "#ff6b6b", // 告警/错误
};

export const BRAND = {
  name: "autotk",
  sub: "SIGNAL DECK",
  lime: C.lime,
  amber: C.amber,
  coral: C.coral,
};

/** 主题色预设（信号色）。 */
export const ACCENTS: Array<{ name: string; value: string }> = [
  { name: "柠檬", value: "#c5f23f" },
  { name: "青", value: "#5ad6e0" },
  { name: "琥珀", value: "#f6b53e" },
  { name: "品红", value: "#ff5c8a" },
  { name: "紫", value: "#a78bfa" },
];

/** 按主题色构建 AntD 主题（colorPrimary/选中/Tab/按钮跟随；成功色固定绿、不跟随）。 */
export function buildTheme(accent: string): ThemeConfig {
  return {
    algorithm: antdTheme.darkAlgorithm,
    token: {
      colorPrimary: accent,
      colorInfo: C.cyan,
      colorSuccess: "#62d68a",
      colorWarning: C.amber,
      colorError: C.coral,
      colorBgBase: C.ink,
      colorTextLightSolid: "#0a0c11", // 浅色主按钮上用近黑文字，保证可读
      borderRadius: 9,
      fontFamily:
        "'Bricolage Grotesque Variable', 'Bricolage Grotesque', system-ui, -apple-system, sans-serif",
      colorBorderSecondary: C.line,
      colorText: C.text,
      colorTextSecondary: C.dim,
    },
    components: {
      Layout: { siderBg: "transparent", headerBg: "transparent", bodyBg: "transparent" },
      Menu: {
        darkItemBg: "transparent",
        darkSubMenuItemBg: "transparent",
        darkItemColor: "#c4cedb",
        darkItemSelectedBg: "rgba(255,255,255,0.06)",
        darkItemSelectedColor: accent,
        darkItemHoverColor: "#ffffff",
        darkItemHoverBg: "rgba(255,255,255,0.05)",
        darkGroupTitleColor: "#6f7c8c",
        groupTitleColor: "#6f7c8c",
        itemMarginInline: 10,
        itemBorderRadius: 0,
        itemHeight: 42,
      },
      Card: { colorBgContainer: C.panel },
      Table: {
        colorBgContainer: "transparent",
        headerBg: "#0f141c",
        borderColor: C.line,
        rowHoverBg: "rgba(255,255,255,0.025)",
      },
      Modal: { contentBg: "#0e1219", headerBg: "#0e1219" },
      Statistic: { colorTextDescription: C.faint },
      Button: { fontWeight: 600 },
      Tabs: { inkBarColor: accent, itemSelectedColor: accent, itemHoverColor: C.text },
    },
  };
}

export const appTheme = buildTheme(C.lime);
