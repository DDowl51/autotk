import type { ThemeConfig } from "antd";

// 品牌与设计 token。方向：精炼的“开发者控制台”——深色侧栏 + 靛蓝强调 + 几何感字体。
export const BRAND = {
  name: "License 控制台",
  tagline: "激活码与授权管理",
  accent: "#4f46e5", // indigo-600
  accentHover: "#4338ca",
  sidebarBg: "#0b1120", // 深石板
  sidebarBgSoft: "#131c31",
  sidebarText: "#94a3b8",
  sidebarTextActive: "#ffffff",
};

export const antdTheme: ThemeConfig = {
  token: {
    colorPrimary: BRAND.accent,
    colorInfo: BRAND.accent,
    colorLink: BRAND.accent,
    borderRadius: 10,
    fontFamily:
      "'Space Grotesk', system-ui, -apple-system, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif",
    fontSize: 14,
    colorBgLayout: "#f6f7fb",
    colorBorderSecondary: "#eceef3",
    boxShadowTertiary: "0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06)",
  },
  components: {
    Layout: {
      headerBg: "#ffffff",
      headerHeight: 60,
      siderBg: BRAND.sidebarBg,
      bodyBg: "#f6f7fb",
    },
    Menu: {
      darkItemBg: "transparent",
      darkSubMenuItemBg: "transparent",
      darkItemSelectedBg: BRAND.accent,
      darkItemColor: BRAND.sidebarText,
      darkItemHoverColor: "#ffffff",
      darkItemSelectedColor: "#ffffff",
      itemBorderRadius: 8,
      itemMarginInline: 10,
    },
    Card: { borderRadiusLG: 14 },
    Table: { headerBg: "#fafbfd", headerColor: "#475467", borderColor: "#eceef3", cellPaddingBlock: 12 },
    Button: { fontWeight: 500, primaryShadow: "none", defaultShadow: "none" },
    Statistic: { titleFontSize: 13 },
  },
};
