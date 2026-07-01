import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { HubProvider } from "./hubState";
import { AppThemeProvider } from "./appTheme";
import { ErrorBoundary } from "./ErrorBoundary";
import { initTelemetry } from "./telemetry";
import "./styles.css";

initTelemetry();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AppThemeProvider>
        <HubProvider>
          <App />
        </HubProvider>
      </AppThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
