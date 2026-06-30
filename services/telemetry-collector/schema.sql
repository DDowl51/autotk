CREATE TABLE IF NOT EXISTS events (
  id          BIGSERIAL PRIMARY KEY,
  system      TEXT   NOT NULL,
  anon_id     TEXT   NOT NULL,
  session_id  TEXT   NOT NULL,
  app_version TEXT,
  name        TEXT   NOT NULL,
  props       JSONB  NOT NULL DEFAULT '{}',
  ts          BIGINT NOT NULL,
  received_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_system_name ON events (system, name);
CREATE INDEX IF NOT EXISTS idx_events_received     ON events (received_at);
