import { normalizeStreamId } from "./streamReportRepository.js";
import { getDatabase } from "../storage/db.js";

function scopeClause({ channelId, legacyChannelLogin }, tableAlias = "streams") {
  if (channelId !== null && channelId !== undefined) {
    return {
      sql: `${tableAlias}.channel_id = ?`,
      parameter: channelId,
    };
  }

  return {
    sql: `${tableAlias}.channel_login = ? COLLATE NOCASE
      AND (
        ${tableAlias}.channel_id IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM channels AS connected_channel
          WHERE connected_channel.id = ${tableAlias}.channel_id
            AND connected_channel.owner_user_id IS NOT NULL
        )
      )`,
    parameter: legacyChannelLogin,
  };
}

export function loadAdvancedAnalyticsDataset(streamId, {
  channelId = null,
  legacyChannelLogin = "fenya",
} = {}) {
  const database = getDatabase();
  const normalizedStreamId = normalizeStreamId(streamId);
  const scope = scopeClause({ channelId, legacyChannelLogin });
  const stream = database.prepare(`
    SELECT * FROM streams
    WHERE stream_id = ? AND ${scope.sql}
  `).get(normalizedStreamId, scope.parameter);

  if (!stream) return null;

  const historyScope = scopeClause({ channelId, legacyChannelLogin }, "streams");
  const orderedStreams = database.prepare(`
    SELECT stream_id AS streamId, channel_id AS channelId, channel_login AS channelLogin,
      started_at AS startedAt, collected_from AS collectedFrom, ended_at AS endedAt,
      stream_date AS streamDate, status, source, created_at AS createdAt
    FROM streams
    WHERE ${historyScope.sql} AND source = ?
    ORDER BY COALESCE(started_at, stream_date, created_at), stream_id
  `).all(historyScope.parameter, stream.source);
  const selectedHistoryIndex = orderedStreams.findIndex((item) => item.streamId === normalizedStreamId);
  const streams = selectedHistoryIndex >= 0
    ? orderedStreams.slice(0, selectedHistoryIndex + 1)
    : orderedStreams;
  const historyStreamIds = new Set(streams.map((item) => item.streamId));

  const chatMessages = database.prepare(`
    SELECT chat_messages.stream_id AS streamId,
      LOWER(TRIM(chat_messages.chatter_login)) AS login,
      COUNT(*) AS messageCount,
      MIN(chat_messages.sent_at) AS firstKnownAt,
      MAX(chat_messages.sent_at) AS lastKnownAt,
      SUM(CASE WHEN chat_messages.sent_at IS NULL THEN 1 ELSE 0 END) AS missingTimestampCount
    FROM chat_messages
    JOIN streams ON streams.stream_id = chat_messages.stream_id
    WHERE ${historyScope.sql} AND streams.source = ? AND chat_messages.source = ?
    GROUP BY chat_messages.stream_id, LOWER(TRIM(chat_messages.chatter_login))
    ORDER BY MIN(COALESCE(chat_messages.sent_at, chat_messages.created_at)),
      chat_messages.stream_id, login
  `).all(historyScope.parameter, stream.source, stream.source)
    .filter((message) => historyStreamIds.has(message.streamId));
  const messageRowCount = database.prepare(`
    SELECT COUNT(*) AS count
    FROM chat_messages
    WHERE stream_id = ? AND source = ?
  `).get(normalizedStreamId, stream.source).count;

  const chatters = database.prepare(`
    SELECT chatters.stream_id AS streamId, chatters.nickname AS login,
      chatters.message_count AS messageCount, chatters.updated_at AS updatedAt
    FROM chatters
    JOIN streams ON streams.stream_id = chatters.stream_id
    WHERE ${historyScope.sql} AND streams.source = ?
    ORDER BY chatters.stream_id, chatters.nickname COLLATE NOCASE
  `).all(historyScope.parameter, stream.source)
    .filter((chatter) => historyStreamIds.has(chatter.streamId));

  const viewerSamples = database.prepare(`
    SELECT event_id AS eventId, time_label AS time, sampled_at AS timestamp,
      viewers, messages_per_minute AS messagesPerMinute, source
    FROM viewer_samples
    WHERE stream_id = ? AND source = ?
    ORDER BY COALESCE(sampled_at, created_at), id
  `).all(normalizedStreamId, stream.source);

  const markers = database.prepare(`
    SELECT COALESCE(event_id, 'marker:' || id) AS eventId, time_label AS time,
      occurred_at AS timestamp, label, marker_type AS type, category_name AS category,
      viewers, messages_per_minute AS messagesPerMinute, source
    FROM stream_markers
    WHERE stream_id = ? AND source = ?
    ORDER BY COALESCE(occurred_at, created_at), id
  `).all(normalizedStreamId, stream.source);

  const segments = database.prepare(`
    SELECT COALESCE(event_id, 'segment:' || id) AS eventId, start_time AS start,
      end_time AS end, label, category_name AS category, source
    FROM stream_segments
    WHERE stream_id = ? AND source = ?
    ORDER BY start_time, id
  `).all(normalizedStreamId, stream.source);

  return {
    stream,
    streams,
    viewerSamples,
    chatMessages,
    chatters,
    messageRowCount,
    markers,
    segments,
  };
}
