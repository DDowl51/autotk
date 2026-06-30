import { createServer } from "node:http";
import { createHandler } from "./http";
import { MemoryEventStore } from "./adapters/memory-store";
import { PgEventStore } from "./adapters/pg-store";

const PORT = Number(process.env.PORT ?? 4100);
const DB = process.env.DATABASE_URL;

// 有 DATABASE_URL 走 Postgres，否则内存（仅本地试跑，重启丢）。
const store = DB ? new PgEventStore(DB) : new MemoryEventStore();

async function boot(): Promise<void> {
  if (store instanceof PgEventStore) await store.ensureSchema();
  createServer(createHandler(store)).listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`telemetry collector on :${PORT}${DB ? "" : " (memory store)"}`);
  });
}
void boot();
