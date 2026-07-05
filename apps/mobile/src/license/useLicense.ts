import { useState, useEffect, useRef, useCallback } from "react";
import type { LicenseClient } from "./sdk";
import { createLicenseClient, deviceName } from "./client";
import { shouldDeactivate } from "./gate";
import { isDeveloperMode } from "../app/devtools";
import { track } from "../telemetry";

export type LicenseState = "loading" | "inactive" | "active";

const HEARTBEAT_INTERVAL_MS = 30 * 60 * 1000; // 30 分钟

/**
 * 激活门禁状态机：
 * - loading：启动时构建 client + 读本地 token（离线也能判断）。
 * - active：有未过期 token；后台定时心跳续期 + 收远程封禁（被封/未激活才踢回）。
 * - inactive：未激活 / 已被封 → 显示激活页。
 */
export function useLicense() {
  const [state, setState] = useState<LicenseState>("loading");
  const clientRef = useRef<LicenseClient | null>(null);
  // 「测试版跳过激活」标志：跳过后无真实 token，必须停掉心跳——否则心跳会因 not_activated
  // 被 shouldDeactivate 判为踢人、把测试者又弹回激活页。
  const devSkippedRef = useRef(false);

  const heartbeat = useCallback(async () => {
    if (devSkippedRef.current) return; // 测试跳过态：无 token，不心跳
    const client = clientRef.current;
    if (!client) return;
    try {
      await client.heartbeat();
    } catch (e) {
      if (shouldDeactivate(e)) setState("inactive"); // 仅封禁/未激活踢人；网络错=离线宽限
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const client = await createLicenseClient();
        clientRef.current = client;
        const active = await client.isActivated();
        if (!alive) return;
        setState(active ? "active" : "inactive");
        if (active) void heartbeat(); // 进入即续一次（顺便收封禁）
      } catch {
        if (alive) setState("inactive");
      }
    })();
    return () => {
      alive = false;
    };
  }, [heartbeat]);

  useEffect(() => {
    if (state !== "active") return;
    const id = setInterval(() => void heartbeat(), HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(id);
  }, [state, heartbeat]);

  /** 激活页调用：失败抛 LicenseError（由调用方转提示）。 */
  const activate = useCallback(async (code: string) => {
    let client = clientRef.current;
    if (!client) {
      client = await createLicenseClient();
      clientRef.current = client;
    }
    try {
      await client.activate(code, { deviceName: deviceName() });
      track("activation_result", { ok: true });
      setState("active");
    } catch (e) {
      track("activation_result", { ok: false });
      throw e;
    }
  }, []);

  /**
   * 仅测试版：跳过激活直接进入 active（不联服务端、不写 token、不心跳）。
   * 双保险——仅当 isDeveloperMode(__DEV__ 或构建期 EXPO_PUBLIC_DEV_TOOLS=1) 时才生效；
   * 交付给买家的生产发行版（两者皆无）调用无效，无法绕过授权。
   */
  const devActivate = useCallback(() => {
    if (!isDeveloperMode(__DEV__, process.env.EXPO_PUBLIC_DEV_TOOLS)) return;
    devSkippedRef.current = true;
    setState("active"); // 不 track：测试跳过不是真实激活，别污染激活指标
  }, []);

  return { state, activate, devActivate };
}
