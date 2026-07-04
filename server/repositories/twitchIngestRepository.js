import { getDatabase } from "../storage/db.js";

const STOP_WORDS = new Set([
  "and", "the", "this", "that", "with", "you", "your", "for", "not", "are",
  "это", "как", "что", "вот", "для", "или", "она", "они", "его", "уже", "ещё", "только",
]);

function timeLabel(timestamp) {
  return new Date(timestamp).toISOString().slice(11, 16);
}

export function extractChatWords(text) {
  return String(text || "").toLocaleLowerCase("ru-RU").match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]{2,}/gu)
    ?.filter((word) => !STOP_WORDS.has(word)) ?? [];
}

function refreshTopWords(database, streamId, timestamp) {
  const topWords = database.prepare(`
    SELECT word_text AS text, count FROM word_stats
    WHERE stream_id = ? ORDER BY count DESC, word_text LIMIT 50
  `).all(streamId);
  database.prepare(`
    UPDATE streams SET top_words_json = ?, words_updated_at = ?, updated_at = ?
    WHERE stream_id = ?
  `).run(JSON.stringify(topWords), timestamp, timestamp, streamId);
}

export function saveTwitchStreamSnapshot(metadata, timestamp = new Date().toISOString()) {
  const database = getDatabase();
  if (!metadata.isLive || !metadata.streamId) {
    database.prepare(`
      UPDATE streams SET status = 'completed', is_current = 0,
        analytics_updated_at = ?, updated_at = ?
      WHERE source = 'twitch' AND is_current = 1
    `).run(timestamp, timestamp);
    return null;
  }

  database.transaction(() => {
    database.prepare("UPDATE streams SET is_current = 0 WHERE stream_id <> ?").run(metadata.streamId);
    database.prepare(`
      INSERT INTO streams (
        stream_id, channel_login, stream_date, title, category_name, started_at,
        status, source, is_current, created_at, updated_at, analytics_updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'live', 'twitch', 1, ?, ?, ?)
      ON CONFLICT(stream_id) DO UPDATE SET
        channel_login = excluded.channel_login,
        title = excluded.title,
        category_name = excluded.category_name,
        started_at = excluded.started_at,
        status = 'live', source = 'twitch', is_current = 1,
        analytics_updated_at = excluded.analytics_updated_at,
        updated_at = excluded.updated_at
    `).run(
      metadata.streamId,
      metadata.channelLogin,
      metadata.startedAt?.slice(0, 10) ?? timestamp.slice(0, 10),
      metadata.streamTitle || "Twitch stream",
      metadata.categoryName || "Twitch",
      metadata.startedAt,
      timestamp,
      timestamp,
      timestamp,
    );

    const minuteStart = new Date(new Date(timestamp).getTime() - 60_000).toISOString();
    const messagesPerMinute = database.prepare(`
      SELECT COUNT(*) AS count FROM chat_messages WHERE stream_id = ? AND sent_at >= ?
    `).get(metadata.streamId, minuteStart).count;
    database.prepare(`
      INSERT OR IGNORE INTO viewer_samples (
        event_id, stream_id, sampled_at, time_label, viewers, messages_per_minute, source, raw_json
      ) VALUES (?, ?, ?, ?, ?, ?, 'twitch', ?)
    `).run(
      `twitch:${metadata.streamId}:viewer:${timestamp}`,
      metadata.streamId,
      timestamp,
      timeLabel(timestamp),
      metadata.viewerCount,
      messagesPerMinute,
      JSON.stringify(metadata),
    );
  })();
  return metadata.streamId;
}

function ensureChatStream(database, event, timestamp) {
  const current = database.prepare(`
    SELECT stream_id FROM streams WHERE source = 'twitch' AND is_current = 1
    ORDER BY updated_at DESC LIMIT 1
  `).get();
  if (current) return current.stream_id;

  const streamId = `twitch-chat-${event.broadcaster_user_id}-${timestamp.slice(0, 10)}`;
  database.prepare(`
    INSERT OR IGNORE INTO streams (
      stream_id, channel_login, stream_date, title, category_name, started_at,
      status, source, is_current, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'Twitch Chat', ?, 'chat-only', 'twitch', 1, ?, ?)
  `).run(
    streamId,
    event.broadcaster_user_login || "fenya",
    timestamp.slice(0, 10),
    `Twitch chat ${timestamp.slice(0, 10)}`,
    timestamp,
    timestamp,
    timestamp,
  );
  return streamId;
}

export function saveTwitchChatMessage(event, timestamp = new Date().toISOString()) {
  const database = getDatabase();
  return database.transaction(() => {
    const streamId = ensureChatStream(database, event, timestamp);
    const result = database.prepare(`
      INSERT OR IGNORE INTO chat_messages (
        event_id, stream_id, sent_at, time_label, chatter_login, message_text,
        message_type, source, raw_json
      ) VALUES (?, ?, ?, ?, ?, ?, 'normal', 'twitch', ?)
    `).run(
      event.message_id,
      streamId,
      timestamp,
      timeLabel(timestamp),
      event.chatter_user_login || event.chatter_user_name || "unknown",
      event.message?.text || "",
      JSON.stringify(event),
    );
    if (result.changes === 0) return { stored: false, streamId };

    const chatter = event.chatter_user_login || event.chatter_user_name || "unknown";
    database.prepare(`
      INSERT INTO chatters (stream_id, nickname, message_count, updated_at)
      VALUES (?, ?, 1, ?)
      ON CONFLICT(stream_id, nickname) DO UPDATE SET
        message_count = chatters.message_count + 1,
        updated_at = excluded.updated_at
    `).run(streamId, chatter, timestamp);

    for (const word of extractChatWords(event.message?.text)) {
      database.prepare(`
        INSERT INTO word_stats (stream_id, word_text, count, weight, tone, category, updated_at)
        VALUES (?, ?, 1, 8, 'neutral', 'chat', ?)
        ON CONFLICT(stream_id, word_text) DO UPDATE SET
          count = word_stats.count + 1,
          weight = MIN(100, 8 + word_stats.count),
          updated_at = excluded.updated_at
      `).run(streamId, word, timestamp);
    }

    database.prepare(`
      UPDATE streams SET
        total_messages = total_messages + 1,
        unique_chatters = (SELECT COUNT(*) FROM chatters WHERE stream_id = ?),
        active_chatters = (SELECT COUNT(*) FROM chatters WHERE stream_id = ?),
        chat_updated_at = ?, updated_at = ?
      WHERE stream_id = ?
    `).run(streamId, streamId, timestamp, timestamp, streamId);
    refreshTopWords(database, streamId, timestamp);
    return { stored: true, streamId };
  })();
}
