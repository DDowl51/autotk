import { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import ConfigScreen from "./src/app/ConfigScreen";
import { ActivationScreen } from "./src/app/ActivationScreen";
import { useLicense } from "./src/license/useLicense";
import { initTelemetry } from "./src/telemetry";

export default function App() {
  const { state, activate } = useLicense();
  useEffect(() => {
    initTelemetry();
  }, []);

  if (state === "loading") {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  if (state === "inactive") {
    return <ActivationScreen onActivate={activate} />;
  }

  return <ConfigScreen />;
}

const styles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: "#0f172a", justifyContent: "center", alignItems: "center" },
});
