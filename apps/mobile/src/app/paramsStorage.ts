import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  type AutomationParams,
  hydrateStoredParams,
  serializeParams,
} from "../params";

/**
 * 设置持久化的 IO 层：把 AutomationParams 存到设备本地（AsyncStorage）。
 * 参数非敏感、体积可能超 SecureStore 的 ~2KB 限额，故用 AsyncStorage 而非 Keychain。
 * 纯的解析/合并逻辑在 `src/params/persist.ts`（可单测）。
 */

const STORAGE_KEY = "autotk.params.v1";

/** 读取并还原设置；无存档/损坏 → 默认参数（hydrate 内部兜底，绝不抛）。 */
export async function loadParams(): Promise<AutomationParams> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return hydrateStoredParams(raw);
  } catch {
    return hydrateStoredParams(null);
  }
}

/** 保存设置；失败只吞掉（持久化不该影响主流程）。 */
export async function saveParams(p: AutomationParams): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, serializeParams(p));
  } catch {
    // 存储失败不上抛：下次变更会再存一次。
  }
}

/**
 * 启动时加载已存设置。返回 null 表示仍在加载（调用方显示 splash），
 * 加载完成后返回一份完整参数。只在挂载时读一次。
 */
export function useStoredParams(): AutomationParams | null {
  const [params, setParams] = useState<AutomationParams | null>(null);
  useEffect(() => {
    let alive = true;
    void loadParams().then((p) => {
      if (alive) setParams(p);
    });
    return () => {
      alive = false;
    };
  }, []);
  return params;
}
