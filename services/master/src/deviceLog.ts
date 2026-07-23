import type { DeviceLogMsg } from "@mc/shared";

export type DeviceLogLevel = DeviceLogMsg["level"];

export interface DeviceLogSink {
  log(deviceId: string, message: string, level?: DeviceLogLevel): void;
  event(deviceId: string, event: string, data?: unknown): void;
}

export interface DeviceLogSinkDeps {
  now?: () => number;
  print?: (message: string) => void;
  report?: (deviceId: string, line: DeviceLogMsg) => void;
}

function serialize(data: unknown): string {
  if (data === undefined) return "";
  if (typeof data === "string") return data;
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

export function eventLevel(event: string): DeviceLogLevel {
  if (event === "batch_error" || event === "circuit_open") return "error";
  if (event === "alert" || event.includes("fail")) return "warn";
  return "info";
}

export function formatEvent(event: string, data?: unknown): string {
  const detail = serialize(data);
  return detail ? `«${event}» ${detail}` : `«${event}»`;
}

export function createDeviceLogSink(deps: DeviceLogSinkDeps = {}): DeviceLogSink {
  const now = deps.now ?? Date.now;
  const print = deps.print ?? console.log;

  const log = (deviceId: string, message: string, level: DeviceLogLevel = "info"): void => {
    print(`[${deviceId}] ${message}`);
    deps.report?.(deviceId, { level, msg: message, ts: now() });
  };

  return {
    log,
    event(deviceId, event, data) {
      log(deviceId, formatEvent(event, data), eventLevel(event));
    },
  };
}
