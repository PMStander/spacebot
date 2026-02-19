CREATE TABLE IF NOT EXISTS artifacts (
    id TEXT PRIMARY KEY,
    channel_id TEXT,
    kind TEXT NOT NULL,           -- "code" | "text" | "image" | "sheet"
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    metadata TEXT,                -- JSON blob for kind-specific data
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS artifacts_channel_id ON artifacts(channel_id);
CREATE INDEX IF NOT EXISTS artifacts_kind ON artifacts(kind);
