import { getDatabase } from "../storage/db.js";

function parseJson(value, fallback) {
  try {
    return typeof value === "string" ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export function normalizeStreamId(streamId) {
  return String(streamId ?? "").trim().replace(/^stream-/, "");
}

export function loadStreamDataset(streamId) {
  const database = getDatabase();
  const normalizedId = normalizeStreamId(streamId);
  const stream = database.prepare("SELECT * FROM streams WHERE stream_id = ?").get(normalizedId);

  if (!stream) {
    return null;
  }

  return {
    stream,
    viewerSamples: database.prepare(`
      SELECT time_label AS time, viewers, messages_per_minute AS messagesPerMinute,
        sampled_at AS timestamp, source
      FROM viewer_samples WHERE stream_id = ? ORDER BY COALESCE(sampled_at, created_at), id
    `).all(normalizedId),
    chatMessages: database.prepare(`
      SELECT time_label AS time, chatter_login AS nickname, message_text AS message,
        message_type AS messageType, sent_at AS timestamp, source
      FROM chat_messages WHERE stream_id = ? ORDER BY COALESCE(sent_at, created_at), id
    `).all(normalizedId),
    chatters: database.prepare(`
      SELECT nickname, message_count AS messages, messages_note AS note
      FROM chatters WHERE stream_id = ? ORDER BY message_count DESC, nickname LIMIT 25
    `).all(normalizedId),
    words: database.prepare(`
      SELECT word_text AS text, count, tone, category
      FROM word_stats WHERE stream_id = ? ORDER BY count DESC, weight DESC LIMIT 30
    `).all(normalizedId),
    moderationActions: database.prepare(`
      SELECT time_label AS time, action_type AS actionType, moderator_login AS moderator,
        target_login AS target, reason, label, note, actions, timeouts, bans,
        deleted_messages AS deletedMessages, occurred_at AS timestamp, source
      FROM moderation_actions WHERE stream_id = ? ORDER BY COALESCE(occurred_at, created_at), id
    `).all(normalizedId),
    segments: database.prepare(`
      SELECT start_time AS start, end_time AS end, label, category_name AS category
      FROM stream_segments WHERE stream_id = ? ORDER BY start_time, id
    `).all(normalizedId),
    markers: database.prepare(`
      SELECT time_label AS time, label, marker_type AS markerType, category_name AS category,
        viewers, messages_per_minute AS messagesPerMinute, occurred_at AS timestamp, source
      FROM stream_markers WHERE stream_id = ? ORDER BY COALESCE(occurred_at, created_at), id
    `).all(normalizedId),
  };
}

export function loadStoredStreamSummary(streamId) {
  const row = getDatabase().prepare(
    "SELECT summary_json FROM stream_summaries WHERE stream_id = ?",
  ).get(normalizeStreamId(streamId));
  return row ? parseJson(row.summary_json, null) : null;
}

export function saveStoredStreamSummary(summary) {
  getDatabase().prepare(`
    INSERT INTO stream_summaries (stream_id, summary_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(stream_id) DO UPDATE SET
      summary_json = excluded.summary_json,
      updated_at = excluded.updated_at
  `).run(summary.streamId, JSON.stringify(summary), summary.updatedAt);
  return summary;
}

