import { useEffect, useState, type ReactNode } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import ConfigScreen from "./src/app/ConfigScreen";
import { ActivationScreen } from "./src/app/ActivationScreen";
import { HelpScreen } from "./src/app/HelpScreen";
import { ErrorBoundary } from "./src/app/ErrorBoundary";
import { useLicense } from "./src/license/useLicense";
import { useStoredParams, getHelpSeen, setHelpSeen } from "./src/app/paramsStorage";
import { initTelemetry } from "./src/telemetry";

export default function App() {
  const { state, activate } = useLicense();
  // 启动即加载已存设置；加载完再挂 ConfigScreen，保证配置界面首屏就带上上次的设置。
  const storedParams = useStoredParams();
  const [helpSeen, setHelpSeenState] = useState<boolean | null>(null);
  useEffect(() => {
    initTelemetry();
    void getHelpSeen()
      .then(setHelpSeenState)
      .catch(() => setHelpSeenState(true)); // 读失败当已看过，避免卡在启动页
  }, []);

  let content: ReactNode;
  if (state === "loading" || (state === "active" && (storedParams === null || helpSeen === null))) {
    content = (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  } else if (state === "inactive") {
    content = <ActivationScreen onActivate={activate} />;
  } else if (helpSeen === false) {
    // 首次激活后先看一遍使用说明（只弹一次）。
    content = (
      <HelpScreen
        onDone={() => {
          void setHelpSeen();
          setHelpSeenState(true);
        }}
      />
    );
  } else {
    content = <ConfigScreen initialParams={storedParams ?? undefined} />;
  }

  return <ErrorBoundary>{content}</ErrorBoundary>;
}

const styles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: "#0f172a", justifyContent: "center", alignItems: "center" },
});
