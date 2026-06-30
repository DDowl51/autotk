import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ConfigProvider, App as AntApp } from "antd";
import zhCN from "antd/locale/zh_CN";
import { buildTheme } from "./theme";
import { loadSettings, saveSettings } from "./settings";

// 外观（主题色）全局状态：动态构建 AntD 主题 + 同步 CSS 变量。

interface AppThemeCtx {
  accent: string;
  setAccent: (c: string) => void;
}

const Ctx = createContext<AppThemeCtx | null>(null);

export function useAppTheme(): AppThemeCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAppTheme 必须在 AppThemeProvider 内使用");
  return v;
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [accent, setAccentState] = useState(() => loadSettings().accent);

  // 自定义 CSS 用 var(--lime) 跟随主题色。
  useEffect(() => {
    document.documentElement.style.setProperty("--lime", accent);
  }, [accent]);

  const setAccent = (c: string) => {
    setAccentState(c);
    saveSettings({ accent: c });
  };

  const theme = useMemo(() => buildTheme(accent), [accent]);

  return (
    <ConfigProvider theme={theme} locale={zhCN}>
      <AntApp>
        <Ctx.Provider value={{ accent, setAccent }}>{children}</Ctx.Provider>
      </AntApp>
    </ConfigProvider>
  );
}
