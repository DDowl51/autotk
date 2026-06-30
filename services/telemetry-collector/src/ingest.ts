import { normalize, type IncomingPayload } from "./events";
import type { EventStore } from "./ports";

/** 收一批事件：归一化 → 入库。返回 { accepted, rejected }。 */
export async function ingest(
  payload: IncomingPayload,
  store: EventStore,
  receivedAt: number = Date.now(),
): Promise<{ accepted: number; rejected: number }> {
  const { rows, rejected } = normalize(payload, receivedAt);
  if (rows.length > 0) await store.insert(rows);
  return { accepted: rows.length, rejected };
}
