PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS twitch_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  twitch_user_id TEXT NOT NULL UNIQUE,
  twitch_login TEXT NOT NULL,
  twitch_display_name TEXT NOT NULL,
  profile_image_url TEXT,
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  scopes_json TEXT NOT NULL DEFAULT '[]',
  expires_at TEXT,
  needs_reauth INTEGER NOT NULL DEFAULT 0 CHECK (needs_reauth IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS twitch_accounts_user_idx ON twitch_accounts(user_id);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  user_agent TEXT,
  ip_address TEXT
);

CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  twitch_broadcaster_id TEXT NOT NULL UNIQUE,
  twitch_login TEXT NOT NULL,
  display_name TEXT NOT NULL,
  profile_image_url TEXT,
  owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS channel_memberships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('channel_owner', 'channel_admin', 'moderator', 'chatter')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (channel_id, user_id)
);

CREATE INDEX IF NOT EXISTS channel_memberships_user_idx ON channel_memberships(user_id, channel_id);

CREATE TABLE IF NOT EXISTS twitch_vods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER REFERENCES channels(id) ON DELETE SET NULL,
  twitch_video_id TEXT NOT NULL UNIQUE,
  twitch_user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL,
  published_at TEXT,
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  viewable TEXT,
  view_count INTEGER NOT NULL DEFAULT 0,
  language TEXT,
  type TEXT NOT NULL DEFAULT 'archive',
  duration TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  muted_segments_json TEXT NOT NULL DEFAULT '[]',
  synced_at TEXT NOT NULL,
  has_internal_analytics INTEGER NOT NULL DEFAULT 0 CHECK (has_internal_analytics IN (0, 1)),
  matched_stream_session_id TEXT REFERENCES streams(stream_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS twitch_vods_channel_idx ON twitch_vods(channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS twitch_vods_created_idx ON twitch_vods(created_at DESC);

CREATE TABLE IF NOT EXISTS channel_moderators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  twitch_user_id TEXT NOT NULL,
  login TEXT NOT NULL,
  display_name TEXT NOT NULL,
  synced_at TEXT NOT NULL,
  UNIQUE (channel_id, twitch_user_id)
);

CREATE INDEX IF NOT EXISTS channel_moderators_channel_idx ON channel_moderators(channel_id, display_name);

CREATE TABLE IF NOT EXISTS streams (
  stream_id TEXT PRIMARY KEY,
  channel_id INTEGER REFERENCES channels(id) ON DELETE SET NULL,
  stream_session_id TEXT,
  channel_login TEXT NOT NULL DEFAULT 'fenya',
  stream_date TEXT,
  title TEXT NOT NULL,
  category_name TEXT,
  started_at TEXT,
  collected_from TEXT,
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
  channel_id INTEGER REFERENCES channels(id) ON DELETE SET NULL,
  stream_session_id TEXT,
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
  channel_id INTEGER REFERENCES channels(id) ON DELETE SET NULL,
  stream_session_id TEXT,
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
