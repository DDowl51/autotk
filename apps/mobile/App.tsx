import { useEffect, useState } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import ConfigScreen from "./src/app/ConfigScreen";
import { ActivationScreen } from "./src/app/ActivationScreen";
import { HelpScreen } from "./src/app/HelpScreen";
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
    void getHelpSeen().then(setHelpSeenState);
  }, []);

  if (
    state === "loading" ||
    (state === "active" && (storedParams === null || helpSeen === null))
  ) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  if (state === "inactive") {
    return <ActivationScreen onActivate={activate} />;
  }

  // 首次激活后先看一遍使用说明（只弹一次）。
  if (helpSeen === false) {
    return (
      <HelpScreen
        onDone={() => {
          void setHelpSeen();
          setHelpSeenState(true);
        }}
      />
    );
  }

  return <ConfigScreen initialParams={storedParams ?? undefined} />;
}

const styles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: "#0f172a", justifyContent: "center", alignItems: "center" },
});
