import { getDatabase } from "../storage/db.js";

const clusterLabels = {
  gameplay: "Игровые моменты",
  reaction: "Реакции",
  chat: "Чат",
  meme: "Мемы",
  moderation: "Модерация",
};

function stringify(value) {
  return JSON.stringify(value ?? null);
}

function parseJson(value, fallback) {
  if (typeof value !== "string" || !value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function timestampForTimeLabel(startedAt, timeLabel) {
  if (!startedAt || !/^\d{2}:\d{2}$/.test(timeLabel)) {
    return null;
  }

  const start = new Date(startedAt);
  if (Number.isNaN(start.getTime())) {
    return null;
  }

  const [hours, minutes] = timeLabel.split(":").map(Number);
  const timestamp = new Date(start);
  timestamp.setUTCHours(hours, minutes, 0, 0);

  if (timestamp.getTime() < start.getTime() - 60 * 60 * 1000) {
    timestamp.setUTCDate(timestamp.getUTCDate() + 1);
  }

  return timestamp.toISOString();
}

function currentStreamRow(database, tableName) {
  return database.prepare(`
    SELECT streams.*
    FROM streams
    WHERE streams.is_current = 1
      AND EXISTS (SELECT 1 FROM ${tableName} WHERE ${tableName}.stream_id = streams.stream_id)
    ORDER BY streams.updated_at DESC
    LIMIT 1
  `).get() ?? null;
}

function insertBaseStream(database, data, isCurrent = false) {
  const now = new Date().toISOString();
  database.prepare(`
    INSERT INTO streams (
      stream_id, channel_login, stream_date, title, category_name, started_at,
      status, source, is_current, created_at, updated_at
    ) VALUES (
      @streamId, @channelLogin, @streamDate, @title, @categoryName, @startedAt,
      @status, @source, @isCurrent, @now, @now
    )
    ON CONFLICT(stream_id) DO UPDATE SET
      title = COALESCE(excluded.title, streams.title),
      category_name = COALESCE(excluded.category_name, streams.category_name),
      started_at = COALESCE(excluded.started_at, streams.started_at),
      stream_date = COALESCE(excluded.stream_date, streams.stream_date),
      source = CASE WHEN streams.source = 'mock' THEN streams.source ELSE excluded.source END,
      is_current = MAX(streams.is_current, excluded.is_current),
      updated_at = excluded.updated_at
  `).run({
    streamId: data.streamId,
    channelLogin: data.channelLogin ?? "fenya",
    streamDate: data.date ?? (/^\d{4}-\d{2}-\d{2}$/.test(data.streamId) ? data.streamId : null),
    title: data.title ?? "Imported stream",
    categoryName: data.categoryName ?? "Imported",
    startedAt: data.startedAt ?? null,
    status: data.status ?? "completed",
    source: data.source ?? "mock",
    isCurrent: isCurrent ? 1 : 0,
    now,
  });
}

function saveAnalytics(database, analytics, source = "mock") {
  const now = new Date().toISOString();
  database.prepare("UPDATE streams SET is_current = 0 WHERE stream_id <> ?").run(analytics.streamId);
  insertBaseStream(database, { ...analytics, source }, true);
  database.prepare(`
    UPDATE streams SET
      title = ?, category_name = ?, started_at = ?, analytics_updated_at = ?,
      is_current = 1, updated_at = ?
    WHERE stream_id = ?
  `).run(
    analytics.title,
    analytics.categoryName,
    analytics.startedAt,
    analytics.updatedAt ?? now,
    now,
    analytics.streamId,
  );

  database.prepare("DELETE FROM viewer_samples WHERE stream_id = ?").run(analytics.streamId);
  database.prepare("DELETE FROM stream_segments WHERE stream_id = ?").run(analytics.streamId);
  database.prepare("DELETE FROM stream_markers WHERE stream_id = ?").run(analytics.streamId);

  const insertSample = database.prepare(`
    INSERT INTO viewer_samples (
      event_id, stream_id, sampled_at, time_label, viewers, messages_per_minute, source, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  analytics.points.forEach((point, index) => {
    insertSample.run(
      `${source}:${analytics.streamId}:viewer:${index}`,
      analytics.streamId,
      timestampForTimeLabel(analytics.startedAt, point.time),
      point.time,
      point.viewers,
      point.messagesPerMinute,
      source,
      stringify(point),
    );
  });

  const insertSegment = database.prepare(`
    INSERT INTO stream_segments (
      event_id, stream_id, start_time, end_time, label, category_name, source, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  analytics.segments.forEach((segment, index) => {
    insertSegment.run(
      `${source}:${analytics.streamId}:segment:${index}`,
      analytics.streamId,
      segment.start,
      segment.end,
      segment.label,
      segment.category ?? segment.label,
      source,
      stringify(segment),
    );
  });

  const insertMarker = database.prepare(`
    INSERT INTO stream_markers (
      event_id, stream_id, occurred_at, time_label, label, marker_type, category_name,
      viewers, messages_per_minute, source, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  analytics.events.forEach((event, index) => {
    insertMarker.run(
      `${source}:${analytics.streamId}:marker:${index}`,
      analytics.streamId,
      timestampForTimeLabel(analytics.startedAt, event.time),
      event.time,
      event.label,
      event.type ?? "stream-event",
      event.category ?? null,
      event.viewers ?? null,
      event.messagesPerMinute ?? null,
      source,
      stringify(event),
    );
  });
}

function saveChat(database, chat, source = "mock") {
  const now = new Date().toISOString();
  insertBaseStream(database, { ...chat, source }, true);
  const streamStartedAt = database.prepare("SELECT started_at FROM streams WHERE stream_id = ?").get(chat.streamId)?.started_at;
  database.prepare(`
    UPDATE streams SET active_chatters = ?, total_messages = ?, activity_peak = ?,
      chat_updated_at = ?, updated_at = ? WHERE stream_id = ?
  `).run(chat.activeNow, chat.totalMessages, chat.activityPeak, chat.updatedAt ?? now, now, chat.streamId);

  database.prepare("DELETE FROM chatters WHERE stream_id = ?").run(chat.streamId);
  database.prepare("DELETE FROM chat_messages WHERE stream_id = ?").run(chat.streamId);

  const chatters = new Map();
  const leaderboardFields = {
    messages: ["messageCount", "messagesNote"],
    watchTime: ["watchTimeValue", "watchTimeNote"],
    tempo: ["tempoValue", "tempoNote"],
    engagement: ["engagementValue", "engagementNote"],
  };

  for (const [leaderboardId, entries] of Object.entries(chat.leaderboards)) {
    const [valueField, noteField] = leaderboardFields[leaderboardId];

    for (const entry of entries) {
      const current = chatters.get(entry.nickname) ?? {
        nickname: entry.nickname,
        messageCount: 0,
        watchTimeValue: "—",
        tempoValue: "—",
        engagementValue: "—",
        messagesNote: "Участник чата",
        watchTimeNote: "Участник чата",
        tempoNote: "Участник чата",
        engagementNote: "Участник чата",
      };
      current[valueField] = entry.value;
      current[noteField] = entry.note;
      chatters.set(entry.nickname, current);
    }
  }

  const insertChatter = database.prepare(`
    INSERT INTO chatters (
      stream_id, nickname, message_count, watch_time_value, tempo_value,
      engagement_value, messages_note, watch_time_note, tempo_note,
      engagement_note, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const chatter of chatters.values()) {
    insertChatter.run(
      chat.streamId,
      chatter.nickname,
      chatter.messageCount,
      chatter.watchTimeValue,
      chatter.tempoValue,
      chatter.engagementValue,
      chatter.messagesNote,
      chatter.watchTimeNote,
      chatter.tempoNote,
      chatter.engagementNote,
      now,
    );
  }

  const insertMessage = database.prepare(`
    INSERT INTO chat_messages (
      event_id, stream_id, sent_at, time_label, chatter_login, message_text,
      message_type, source, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  chat.recentMessages.forEach((message, index) => {
    insertMessage.run(
      `${source}:${chat.streamId}:chat:${index}`,
      chat.streamId,
      timestampForTimeLabel(streamStartedAt, message.time),
      message.time,
      message.nickname,
      message.text,
      message.type,
      source,
      stringify(message),
    );
  });
}

function saveWords(database, words, source = "mock") {
  const now = new Date().toISOString();
  insertBaseStream(database, { ...words, source }, true);
  database.prepare(`
    UPDATE streams SET word_clusters_json = ?, words_updated_at = ?, updated_at = ?
    WHERE stream_id = ?
  `).run(stringify(words.clusters), words.updatedAt ?? now, now, words.streamId);
  database.prepare("DELETE FROM word_stats WHERE stream_id = ?").run(words.streamId);

  const insertWord = database.prepare(`
    INSERT INTO word_stats (stream_id, word_text, count, weight, tone, category, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const word of words.words) {
    insertWord.run(words.streamId, word.text, word.count, word.weight, word.tone, word.category, now);
  }
}

function saveModeration(database, moderation, source = "mock") {
  const now = new Date().toISOString();
  insertBaseStream(database, { ...moderation, source }, true);
  const streamStartedAt = database.prepare("SELECT started_at FROM streams WHERE stream_id = ?").get(moderation.streamId)?.started_at;
  database.prepare(`
    UPDATE streams SET moderation_actions = ?, moderation_summary_json = ?,
      moderators_json = ?, moderation_timeline_json = ?, moderation_updated_at = ?,
      updated_at = ? WHERE stream_id = ?
  `).run(
    moderation.summary.totalActions,
    stringify(moderation.summary),
    stringify(moderation.moderators),
    stringify(moderation.timeline),
    moderation.updatedAt ?? now,
    now,
    moderation.streamId,
  );
  database.prepare("DELETE FROM moderation_actions WHERE stream_id = ?").run(moderation.streamId);

  const insertAction = database.prepare(`
    INSERT INTO moderation_actions (
      event_id, stream_id, occurred_at, time_label, action_type, label, note, actions,
      timeouts, bans, deleted_messages, source, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  moderation.events.forEach((event, index) => {
    insertAction.run(
      `${source}:${moderation.streamId}:moderation:${index}`,
      moderation.streamId,
      timestampForTimeLabel(streamStartedAt, event.time),
      event.time,
      event.type,
      event.label,
      event.note,
      event.actions,
      event.timeouts ?? 0,
      event.bans ?? 0,
      event.deletedMessages ?? 0,
      source,
      stringify(event),
    );
  });
}

function saveArchive(database, archive, source = "mock") {
  const now = new Date().toISOString();
  for (const stream of archive.streams) {
    insertBaseStream(database, { ...stream, channelLogin: archive.channelLogin, source }, false);
    database.prepare(`
      UPDATE streams SET stream_date = ?, title = ?, category_name = ?, started_at = ?,
        ended_at = ?, duration_minutes = ?, average_viewers = ?, peak_viewers = ?,
        total_messages = ?, unique_chatters = ?, moderation_actions = ?, top_words_json = ?,
        top_moment = ?, summary_text = ?, status = ?, archive_updated_at = ?, updated_at = ?
      WHERE stream_id = ?
    `).run(
      stream.date,
      stream.title,
      stream.categoryName,
      stream.startedAt,
      stream.endedAt,
      stream.durationMinutes,
      stream.averageViewers,
      stream.peakViewers,
      stream.totalMessages,
      stream.uniqueChatters,
      stream.moderationActions,
      stringify(stream.topWords),
      stream.topMoment,
      stream.summary,
      stream.status,
      archive.updatedAt ?? now,
      now,
      stream.streamId,
    );
  }
}

function saveSummary(database, summary, source = "mock") {
  insertBaseStream(database, { ...summary, source }, true);
  database.prepare(`
    INSERT INTO stream_summaries (stream_id, summary_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(stream_id) DO UPDATE SET summary_json = excluded.summary_json,
      updated_at = excluded.updated_at
  `).run(summary.streamId, stringify(summary), summary.updatedAt ?? new Date().toISOString());
}

export function seedDashboardData(data) {
  const database = getDatabase();
  database.transaction(() => {
    for (const table of [
      "stream_summaries",
      "stream_markers",
      "stream_segments",
      "moderation_actions",
      "word_stats",
      "chatters",
      "chat_messages",
      "viewer_samples",
      "streams",
    ]) {
      database.prepare(`DELETE FROM ${table}`).run();
    }

    saveArchive(database, data.archive);
    saveAnalytics(database, data.analytics);
    saveChat(database, data.chat);
    saveWords(database, data.words);
    saveModeration(database, data.moderation);
    saveSummary(database, data.summary);
  })();
}

export function saveStreamAnalyticsToDatabase(analytics) {
  getDatabase().transaction(() => saveAnalytics(getDatabase(), analytics))();
}

export function saveChatAnalyticsToDatabase(chat) {
  getDatabase().transaction(() => saveChat(getDatabase(), chat))();
}

export function saveWordAnalyticsToDatabase(words) {
  getDatabase().transaction(() => saveWords(getDatabase(), words))();
}

export function saveModerationAnalyticsToDatabase(moderation) {
  getDatabase().transaction(() => saveModeration(getDatabase(), moderation))();
}

export function saveArchiveToDatabase(archive) {
  getDatabase().transaction(() => saveArchive(getDatabase(), archive))();
}

export function saveSummaryToDatabase(summary) {
  getDatabase().transaction(() => saveSummary(getDatabase(), summary))();
}

export function loadCurrentStreamAnalyticsFromDatabase() {
  const database = getDatabase();
  const stream = currentStreamRow(database, "viewer_samples");

  if (!stream) {
    return null;
  }

  const points = database.prepare(`
    SELECT time_label AS time, viewers, messages_per_minute AS messagesPerMinute
    FROM viewer_samples WHERE stream_id = ? ORDER BY COALESCE(sampled_at, created_at), id
  `).all(stream.stream_id);
  const segments = database.prepare(`
    SELECT start_time AS start, end_time AS end, label
    FROM stream_segments WHERE stream_id = ? ORDER BY start_time, id
  `).all(stream.stream_id);
  const events = database.prepare(`
    SELECT time_label AS time, label, category_name AS category, marker_type AS type,
      viewers, messages_per_minute AS messagesPerMinute
    FROM stream_markers WHERE stream_id = ? ORDER BY COALESCE(occurred_at, created_at), id
  `).all(stream.stream_id).map((event) => Object.fromEntries(
    Object.entries(event).filter(([, value]) => value !== null),
  ));

  return {
    streamId: stream.stream_id,
    title: stream.title,
    categoryName: stream.category_name,
    startedAt: stream.started_at,
    points,
    segments,
    events,
    updatedAt: stream.analytics_updated_at ?? stream.updated_at,
  };
}

export function loadCurrentChatAnalyticsFromDatabase() {
  const database = getDatabase();
  const stream = currentStreamRow(database, "chatters");

  if (!stream) {
    return null;
  }

  const rows = database.prepare("SELECT * FROM chatters WHERE stream_id = ?").all(stream.stream_id);
  const toLeaderboard = (valueField, noteField, numeric = false) => rows
    .map((row) => ({
      nickname: row.nickname,
      value: numeric ? row[valueField] : row[valueField],
      note: row[noteField],
    }))
    .sort((first, second) => numeric ? second.value - first.value : first.nickname.localeCompare(second.nickname))
    .slice(0, 25);
  const recentMessages = database.prepare(`
    SELECT time_label AS time, chatter_login AS nickname, message_text AS text,
      message_type AS type FROM chat_messages WHERE stream_id = ?
    ORDER BY COALESCE(sent_at, created_at) DESC, id DESC LIMIT 25
  `).all(stream.stream_id).reverse();

  return {
    streamId: stream.stream_id,
    title: stream.title,
    activeNow: stream.active_chatters,
    totalMessages: stream.total_messages,
    activityPeak: stream.activity_peak,
    leaderboards: {
      messages: toLeaderboard("message_count", "messages_note", true),
      watchTime: toLeaderboard("watch_time_value", "watch_time_note"),
      tempo: toLeaderboard("tempo_value", "tempo_note"),
      engagement: toLeaderboard("engagement_value", "engagement_note"),
    },
    recentMessages,
    updatedAt: stream.chat_updated_at ?? stream.updated_at,
  };
}

export function loadCurrentWordAnalyticsFromDatabase() {
  const database = getDatabase();
  const stream = currentStreamRow(database, "word_stats");

  if (!stream) {
    return null;
  }

  const words = database.prepare(`
    SELECT word_text AS text, count, weight, tone, category
    FROM word_stats WHERE stream_id = ? ORDER BY weight DESC, count DESC
  `).all(stream.stream_id);
  let clusters = parseJson(stream.word_clusters_json, []);

  if (!clusters.length) {
    const counts = words.reduce((result, word) => {
      result[word.category] = (result[word.category] ?? 0) + 1;
      return result;
    }, {});
    clusters = Object.entries(counts).map(([category, value]) => ({
      label: clusterLabels[category] ?? category,
      value,
    }));
  }

  return {
    streamId: stream.stream_id,
    title: stream.title,
    source: stream.source === "import" ? "import" : "demo",
    updatedAt: stream.words_updated_at ?? stream.updated_at,
    words,
    clusters,
  };
}

export function loadCurrentModerationAnalyticsFromDatabase() {
  const database = getDatabase();
  const stream = currentStreamRow(database, "moderation_actions");
  const moderators = stream ? parseJson(stream.moderators_json, []) : [];

  if (!stream || !moderators.length) {
    return null;
  }

  const events = database.prepare(`
    SELECT time_label AS time, label, action_type AS type, actions, note,
      timeouts, bans, deleted_messages AS deletedMessages
    FROM moderation_actions WHERE stream_id = ? ORDER BY id
  `).all(stream.stream_id);

  return {
    streamId: stream.stream_id,
    title: stream.title,
    updatedAt: stream.moderation_updated_at ?? stream.updated_at,
    summary: parseJson(stream.moderation_summary_json, {}),
    moderators,
    timeline: parseJson(stream.moderation_timeline_json, []),
    events,
  };
}

export function loadStreamArchiveFromDatabase() {
  const database = getDatabase();
  const rows = database.prepare(`
    SELECT * FROM streams
    WHERE stream_date IS NOT NULL AND duration_minutes IS NOT NULL
    ORDER BY stream_date DESC, started_at DESC
    LIMIT 50
  `).all();

  if (!rows.length) {
    return null;
  }

  return {
    channelLogin: rows[0].channel_login,
    updatedAt: rows[0].archive_updated_at ?? rows[0].updated_at,
    streams: rows.map((stream) => ({
      streamId: stream.stream_id,
      date: stream.stream_date,
      title: stream.title,
      categoryName: stream.category_name,
      startedAt: stream.started_at,
      endedAt: stream.ended_at,
      durationMinutes: stream.duration_minutes,
      averageViewers: stream.average_viewers,
      peakViewers: stream.peak_viewers,
      totalMessages: stream.total_messages,
      uniqueChatters: stream.unique_chatters,
      moderationActions: stream.moderation_actions,
      topWords: parseJson(stream.top_words_json, ["стрим"]),
      topMoment: stream.top_moment,
      summary: stream.summary_text,
      status: stream.status,
    })),
  };
}

export function loadCurrentSummaryFromDatabase() {
  const database = getDatabase();
  const row = database.prepare(`
    SELECT stream_summaries.summary_json
    FROM stream_summaries
    JOIN streams USING (stream_id)
    WHERE streams.is_current = 1
    ORDER BY stream_summaries.updated_at DESC
    LIMIT 1
  `).get();

  return row ? parseJson(row.summary_json, null) : null;
}
