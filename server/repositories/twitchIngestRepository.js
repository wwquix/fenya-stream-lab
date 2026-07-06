import { getDatabase } from "../storage/db.js";

const STOP_WORDS = new Set([
  "and", "the", "this", "that", "with", "you", "your", "for", "not", "are",
  "это", "как", "что", "вот", "для", "или", "она", "они", "его", "уже", "ещё", "только",
]);

function timeLabel(timestamp) {
  return new Date(timestamp).toISOString().slice(11, 16);
}

function resolveChannelId(database, configuredChannelId, broadcaster) {
  if (configuredChannelId !== null && configuredChannelId !== undefined) return configuredChannelId;
  const broadcasterId = String(broadcaster.broadcasterId ?? broadcaster.broadcaster_user_id ?? "").trim();
  if (!broadcasterId) throw new TypeError("Twitch broadcaster id is required for ingest storage");
  const existing = database.prepare("SELECT id FROM channels WHERE twitch_broadcaster_id = ?").get(broadcasterId);
  if (existing) return existing.id;
  const now = new Date().toISOString();
  const login = broadcaster.channelLogin || broadcaster.broadcaster_user_login || "unknown";
  const result = database.prepare(`
    INSERT INTO channels (
      twitch_broadcaster_id, twitch_login, display_name, profile_image_url,
      owner_user_id, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, NULL, 1, ?, ?)
  `).run(broadcasterId, login, broadcaster.displayName || login, broadcaster.profileImageUrl || null, now, now);
  return result.lastInsertRowid;
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

export function saveTwitchStreamSnapshot(metadata, timestamp = new Date().toISOString(), context = {}) {
  const database = getDatabase();
  const channelId = resolveChannelId(database, context.channelId, metadata);
  const streamSessionId = metadata.streamId ?? context.streamSessionId ?? null;
  if (!metadata.isLive || !metadata.streamId) {
    database.prepare(`
      UPDATE streams SET
        status = 'completed', is_current = 0, ended_at = COALESCE(ended_at, ?),
        duration_minutes = COALESCE(duration_minutes, CASE
          WHEN started_at IS NULL THEN NULL
          ELSE MAX(1, CAST(ROUND((julianday(?) - julianday(started_at)) * 1440) AS INTEGER))
        END),
        average_viewers = COALESCE((
          SELECT ROUND(AVG(viewers)) FROM viewer_samples WHERE viewer_samples.stream_id = streams.stream_id
        ), average_viewers),
        peak_viewers = COALESCE((
          SELECT MAX(viewers) FROM viewer_samples WHERE viewer_samples.stream_id = streams.stream_id
        ), peak_viewers),
        analytics_updated_at = ?, archive_updated_at = ?, updated_at = ?
      WHERE source = 'twitch' AND is_current = 1 AND status = 'live'
        AND ((? IS NULL AND channel_id IS NULL) OR channel_id = ?)
    `).run(timestamp, timestamp, timestamp, timestamp, timestamp, channelId, channelId);
    return null;
  }

  database.transaction(() => {
    database.prepare(`
      UPDATE streams SET is_current = 0
      WHERE stream_id <> ? AND ((? IS NULL AND channel_id IS NULL) OR channel_id = ?)
    `).run(metadata.streamId, channelId, channelId);
    database.prepare(`
      INSERT INTO streams (
        stream_id, channel_id, stream_session_id, channel_login, stream_date, title, category_name, started_at,
        status, source, is_current, created_at, updated_at, analytics_updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'live', 'twitch', 1, ?, ?, ?)
      ON CONFLICT(stream_id) DO UPDATE SET
        channel_id = excluded.channel_id,
        stream_session_id = excluded.stream_session_id,
        channel_login = excluded.channel_login,
        title = excluded.title,
        category_name = excluded.category_name,
        started_at = excluded.started_at,
        status = 'live', source = 'twitch', is_current = 1,
        analytics_updated_at = excluded.analytics_updated_at,
        updated_at = excluded.updated_at
    `).run(
      metadata.streamId,
      channelId,
      streamSessionId,
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
        event_id, stream_id, channel_id, stream_session_id, sampled_at, time_label,
        viewers, messages_per_minute, source, raw_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'twitch', ?)
    `).run(
      `twitch:${metadata.streamId}:viewer:${timestamp}`,
      metadata.streamId,
      channelId,
      streamSessionId,
      timestamp,
      timeLabel(timestamp),
      metadata.viewerCount,
      messagesPerMinute,
      JSON.stringify(metadata),
    );
  })();
  return metadata.streamId;
}

function ensureChatStream(database, event, timestamp, context) {
  const channelId = context.channelId ?? null;
  const current = database.prepare(`
    SELECT stream_id, stream_session_id FROM streams WHERE source = 'twitch' AND is_current = 1
      AND ((? IS NULL AND channel_id IS NULL) OR channel_id = ?)
    ORDER BY updated_at DESC LIMIT 1
  `).get(channelId, channelId);
  if (current) return current;

  const streamId = context.streamSessionId || `twitch-chat-${event.broadcaster_user_id}-${timestamp.slice(0, 10)}`;
  database.prepare(`
    INSERT OR IGNORE INTO streams (
      stream_id, channel_id, stream_session_id, channel_login, stream_date, title, category_name, started_at,
      status, source, is_current, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'Twitch Chat', ?, 'chat-only', 'twitch', 1, ?, ?)
  `).run(
    streamId,
    channelId,
    context.streamSessionId ?? streamId,
    event.broadcaster_user_login || "fenya",
    timestamp.slice(0, 10),
    `Twitch chat ${timestamp.slice(0, 10)}`,
    timestamp,
    timestamp,
    timestamp,
  );
  return { stream_id: streamId, stream_session_id: context.streamSessionId ?? streamId };
}

export function saveTwitchChatMessage(event, timestamp = new Date().toISOString(), context = {}) {
  const database = getDatabase();
  return database.transaction(() => {
    const channelId = resolveChannelId(database, context.channelId, event);
    const scopedContext = { ...context, channelId };
    const stream = ensureChatStream(database, event, timestamp, scopedContext);
    const streamId = stream.stream_id;
    const streamSessionId = context.streamSessionId ?? stream.stream_session_id ?? streamId;
    const result = database.prepare(`
      INSERT OR IGNORE INTO chat_messages (
        event_id, stream_id, channel_id, stream_session_id, sent_at, time_label, chatter_login, message_text,
        message_type, source, raw_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'normal', 'twitch', ?)
    `).run(
      event.message_id,
      streamId,
      channelId,
      streamSessionId,
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
    return { stored: true, streamId, channelId, streamSessionId };
  })();
}
