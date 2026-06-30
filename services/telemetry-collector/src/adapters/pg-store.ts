import type { EventStore } from "../ports";
import type { StoredEvent } from "../events";
import type { Summary, SeriesPoint } from "../aggregate";

// 运行时用 require 懒加载 pg（npm i pg），避免没装时编译/测试报错。
declare const require: (moduleName: string) => any;

/** Postgres 事件存储。建表见 schema.sql。 */
export class PgEventStore implements EventStore {
  private readonly pool: any;

  constructor(connectionString: string) {
    const { Pool } = require("pg");
    this.pool = new Pool({ connectionString });
  }

  /** 幂等建表（启动时调一次，省得手动跑 schema.sql）。 */
  async ensureSchema(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS events (
        id BIGSERIAL PRIMARY KEY,
        system TEXT NOT NULL, anon_id TEXT NOT NULL, session_id TEXT NOT NULL,
        app_version TEXT, name TEXT NOT NULL, props JSONB NOT NULL DEFAULT '{}',
        ts BIGINT NOT NULL, received_at BIGINT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_events_system_name ON events (system, name);
      CREATE INDEX IF NOT EXISTS idx_events_received ON events (received_at);
    `);
  }

  async insert(rows: StoredEvent[]): Promise<void> {
    if (rows.length === 0) return;
    const cols = 8;
    const values: unknown[] = [];
    const tuples = rows.map((r, i) => {
      values.push(
        r.system,
        r.anonId,
        r.sessionId,
        r.appVersion,
        r.name,
        JSON.stringify(r.props),
        r.ts,
        r.receivedAt,
      );
      const b = i * cols;
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6}::jsonb,$${b + 7},$${b + 8})`;
    });
    const sql =
      "INSERT INTO events (system, anon_id, session_id, app_version, name, props, ts, received_at) VALUES " +
      tuples.join(",");
    await this.pool.query(sql, values);
  }

  async count(): Promise<number> {
    const r = await this.pool.query("SELECT count(*)::int AS c FROM events");
    return r.rows[0].c as number;
  }

  async summary(sinceMs = 0): Promise<Summary> {
    const totalQ = await this.pool.query("SELECT count(*)::int AS c FROM events WHERE received_at >= $1", [sinceMs]);
    const sysQ = await this.pool.query(
      "SELECT system, count(*)::int AS c FROM events WHERE received_at >= $1 GROUP BY system",
      [sinceMs],
    );
    const evQ = await this.pool.query(
      "SELECT name, count(*)::int AS c FROM events WHERE received_at >= $1 GROUP BY name ORDER BY c DESC",
      [sinceMs],
    );
    const bySystem: Record<string, number> = {};
    for (const row of sysQ.rows) bySystem[row.system] = row.c;
    return {
      total: totalQ.rows[0].c as number,
      bySystem,
      byEvent: evQ.rows.map((r: { name: string; c: number }) => ({ name: r.name, count: r.c })),
    };
  }

  async series(bucketMs: number, sinceMs: number): Promise<SeriesPoint[]> {
    const q = await this.pool.query(
      "SELECT (received_at / $1) * $1 AS t, count(*)::int AS c FROM events WHERE received_at >= $2 GROUP BY t ORDER BY t",
      [bucketMs, sinceMs],
    );
    return q.rows.map((r: { t: string | number; c: number }) => ({ t: Number(r.t), count: r.c }));
  }
}
