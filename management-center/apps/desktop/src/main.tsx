import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { HubProvider } from "./hubState";
import { AppThemeProvider } from "./appTheme";
import { initTelemetry } from "./telemetry";
import "./styles.css";

initTelemetry();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppThemeProvider>
      <HubProvider>
        <App />
      </HubProvider>
    </AppThemeProvider>
  </React.StrictMode>,
);
