PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS streams (
  stream_id TEXT PRIMARY KEY,
  channel_login TEXT NOT NULL DEFAULT 'fenya',
  stream_date TEXT,
  title TEXT NOT NULL,
  category_name TEXT,
  started_at TEXT,
  ended_at TEXT,
  duration_minutes INTEGER,
  average_viewers INTEGER,
  peak_viewers INTEGER,
  total_messages INTEGER NOT NULL DEFAULT 0,
  unique_chatters INTEGER NOT NULL DEFAULT 0,
  moderation_actions INTEGER NOT NULL DEFAULT 0,
  active_chatters INTEGER NOT NULL DEFAULT 0,
  activity_peak REAL NOT NULL DEFAULT 1,
  top_words_json TEXT NOT NULL DEFAULT '[]',
  top_moment TEXT,
  summary_text TEXT,
  status TEXT NOT NULL DEFAULT 'completed',
  source TEXT NOT NULL DEFAULT 'mock',
  is_current INTEGER NOT NULL DEFAULT 0,
  word_clusters_json TEXT NOT NULL DEFAULT '[]',
  moderation_summary_json TEXT NOT NULL DEFAULT '{}',
  moderators_json TEXT NOT NULL DEFAULT '[]',
  moderation_timeline_json TEXT NOT NULL DEFAULT '[]',
  analytics_updated_at TEXT,
  chat_updated_at TEXT,
  words_updated_at TEXT,
  moderation_updated_at TEXT,
  archive_updated_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS viewer_samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT UNIQUE,
  stream_id TEXT NOT NULL REFERENCES streams(stream_id) ON DELETE CASCADE,
  sampled_at TEXT,
  time_label TEXT NOT NULL,
  viewers INTEGER NOT NULL,
  messages_per_minute INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'mock',
  raw_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS viewer_samples_stream_idx ON viewer_samples(stream_id, id);

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT UNIQUE,
  stream_id TEXT NOT NULL REFERENCES streams(stream_id) ON DELETE CASCADE,
  sent_at TEXT,
  time_label TEXT NOT NULL,
  chatter_login TEXT NOT NULL,
  message_text TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'normal',
  source TEXT NOT NULL DEFAULT 'mock',
  raw_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS chat_messages_stream_idx ON chat_messages(stream_id, id);

CREATE TABLE IF NOT EXISTS chatters (
  stream_id TEXT NOT NULL REFERENCES streams(stream_id) ON DELETE CASCADE,
  nickname TEXT NOT NULL,
  message_count INTEGER NOT NULL DEFAULT 0,
  watch_time_value TEXT NOT NULL DEFAULT '—',
  tempo_value TEXT NOT NULL DEFAULT '—',
  engagement_value TEXT NOT NULL DEFAULT '—',
  messages_note TEXT NOT NULL DEFAULT 'Участник чата',
  watch_time_note TEXT NOT NULL DEFAULT 'Участник чата',
  tempo_note TEXT NOT NULL DEFAULT 'Участник чата',
  engagement_note TEXT NOT NULL DEFAULT 'Участник чата',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (stream_id, nickname)
);

CREATE TABLE IF NOT EXISTS word_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stream_id TEXT NOT NULL REFERENCES streams(stream_id) ON DELETE CASCADE,
  word_text TEXT NOT NULL,
  count INTEGER NOT NULL,
  weight INTEGER NOT NULL,
  tone TEXT NOT NULL,
  category TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (stream_id, word_text)
);

CREATE TABLE IF NOT EXISTS moderation_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT UNIQUE,
  stream_id TEXT NOT NULL REFERENCES streams(stream_id) ON DELETE CASCADE,
  occurred_at TEXT,
  time_label TEXT NOT NULL,
  action_type TEXT NOT NULL,
  moderator_login TEXT,
  target_login TEXT,
  reason TEXT,
  label TEXT NOT NULL,
  note TEXT,
  actions INTEGER NOT NULL DEFAULT 1,
  timeouts INTEGER NOT NULL DEFAULT 0,
  bans INTEGER NOT NULL DEFAULT 0,
  deleted_messages INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'mock',
  raw_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS moderation_actions_stream_idx ON moderation_actions(stream_id, id);

CREATE TABLE IF NOT EXISTS stream_segments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT UNIQUE,
  stream_id TEXT NOT NULL REFERENCES streams(stream_id) ON DELETE CASCADE,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  label TEXT NOT NULL,
  category_name TEXT,
  source TEXT NOT NULL DEFAULT 'mock',
  raw_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stream_markers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT UNIQUE,
  stream_id TEXT NOT NULL REFERENCES streams(stream_id) ON DELETE CASCADE,
  occurred_at TEXT,
  time_label TEXT NOT NULL,
  label TEXT NOT NULL,
  marker_type TEXT NOT NULL DEFAULT 'stream-event',
  category_name TEXT,
  viewers INTEGER,
  messages_per_minute INTEGER,
  source TEXT NOT NULL DEFAULT 'mock',
  raw_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stream_summaries (
  stream_id TEXT PRIMARY KEY REFERENCES streams(stream_id) ON DELETE CASCADE,
  summary_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS import_jobs (
  job_id TEXT PRIMARY KEY,
  format TEXT NOT NULL,
  status TEXT NOT NULL,
  source_name TEXT,
  stream_id TEXT,
  total_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS import_errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL REFERENCES import_jobs(job_id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  event_type TEXT,
  message TEXT NOT NULL,
  payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS import_errors_job_idx ON import_errors(job_id, id);

CREATE TABLE IF NOT EXISTS replay_sessions (
  session_id TEXT PRIMARY KEY,
  stream_id TEXT REFERENCES streams(stream_id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  options_json TEXT NOT NULL DEFAULT '{}',
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
