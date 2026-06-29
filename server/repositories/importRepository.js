import { getDatabase } from "../storage/db.js";

function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function mapJob(row) {
  return row
    ? {
        jobId: row.job_id,
        format: row.format,
        status: row.status,
        sourceName: row.source_name,
        streamId: row.stream_id,
        totalCount: row.total_count,
        successCount: row.success_count,
        rejectedCount: row.rejected_count,
        createdAt: row.created_at,
        completedAt: row.completed_at,
      }
    : null;
}

function ensureStream(database, event) {
  const now = new Date().toISOString();
  const hasCurrentStream = database.prepare("SELECT 1 FROM streams WHERE is_current = 1 LIMIT 1").get();
  database.prepare(`
    INSERT INTO streams (
      stream_id, title, category_name, started_at, source, is_current, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'import', ?, ?, ?)
    ON CONFLICT(stream_id) DO UPDATE SET updated_at = excluded.updated_at
  `).run(
    event.streamId,
    `Imported stream ${event.streamId}`,
    "Imported",
    event.timestamp,
    hasCurrentStream ? 0 : 1,
    now,
    now,
  );
}

function getTimeLabel(timestamp) {
  return new Date(timestamp).toISOString().slice(11, 16);
}

function saveChatMessage(database, event, source) {
  database.prepare(`
    INSERT INTO chat_messages (
      event_id, stream_id, sent_at, time_label, chatter_login, message_text,
      message_type, source, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.eventId,
    event.streamId,
    event.timestamp,
    getTimeLabel(event.timestamp),
    event.chatter,
    event.message,
    event.messageType,
    source,
    JSON.stringify(event),
  );
  database.prepare(`
    INSERT INTO chatters (stream_id, nickname, message_count, updated_at)
    VALUES (?, ?, 1, ?)
    ON CONFLICT(stream_id, nickname) DO UPDATE SET
      message_count = chatters.message_count + 1,
      updated_at = excluded.updated_at
  `).run(event.streamId, event.chatter, event.timestamp);
  database.prepare(`
    UPDATE streams SET total_messages = total_messages + 1,
      active_chatters = (SELECT COUNT(*) FROM chatters WHERE stream_id = ?),
      chat_updated_at = ?, updated_at = ? WHERE stream_id = ?
  `).run(event.streamId, event.timestamp, event.timestamp, event.streamId);
}

function saveViewerSample(database, event, source) {
  database.prepare(`
    INSERT INTO viewer_samples (
      event_id, stream_id, sampled_at, time_label, viewers, messages_per_minute,
      source, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.eventId,
    event.streamId,
    event.timestamp,
    getTimeLabel(event.timestamp),
    event.viewers,
    event.messagesPerMinute,
    source,
    JSON.stringify(event),
  );
  database.prepare(`
    UPDATE streams SET analytics_updated_at = ?, updated_at = ? WHERE stream_id = ?
  `).run(event.timestamp, event.timestamp, event.streamId);
}

function saveModerationAction(database, event, source) {
  const breakdown = {
    actions: 1,
    timeouts: event.action === "timeout" ? 1 : 0,
    bans: event.action === "ban" ? 1 : 0,
    deletedMessages: event.action === "delete_message" ? 1 : 0,
  };
  const label = event.label ?? event.action.replaceAll("_", " ");
  database.prepare(`
    INSERT INTO moderation_actions (
      event_id, stream_id, occurred_at, time_label, action_type, moderator_login,
      target_login, reason, label, note, actions, timeouts, bans, deleted_messages,
      source, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.eventId,
    event.streamId,
    event.timestamp,
    getTimeLabel(event.timestamp),
    event.action,
    event.moderator ?? null,
    event.target ?? null,
    event.reason ?? null,
    label,
    event.reason ?? "Imported moderation action",
    breakdown.actions,
    breakdown.timeouts,
    breakdown.bans,
    breakdown.deletedMessages,
    source,
    JSON.stringify(event),
  );

  const row = database.prepare("SELECT moderation_summary_json FROM streams WHERE stream_id = ?").get(event.streamId);
  const summary = parseJson(row?.moderation_summary_json, {});
  summary.totalActions = (summary.totalActions ?? 0) + breakdown.actions;
  summary.timeouts = (summary.timeouts ?? 0) + breakdown.timeouts;
  summary.bans = (summary.bans ?? 0) + breakdown.bans;
  summary.deletedMessages = (summary.deletedMessages ?? 0) + breakdown.deletedMessages;
  summary.averageResponseTimeSec ??= 10;
  summary.peakModerationMinute ??= getTimeLabel(event.timestamp);

  database.prepare(`
    UPDATE streams SET moderation_actions = moderation_actions + 1,
      moderation_summary_json = ?, moderation_updated_at = ?, updated_at = ?
    WHERE stream_id = ?
  `).run(JSON.stringify(summary), event.timestamp, event.timestamp, event.streamId);
}

function saveStreamMarker(database, event, source) {
  database.prepare(`
    INSERT INTO stream_markers (
      event_id, stream_id, occurred_at, time_label, label, marker_type,
      category_name, viewers, messages_per_minute, source, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.eventId,
    event.streamId,
    event.timestamp,
    getTimeLabel(event.timestamp),
    event.label,
    event.markerType,
    event.category ?? null,
    event.viewers ?? null,
    event.messagesPerMinute ?? null,
    source,
    JSON.stringify(event),
  );
}

function saveStreamSegment(database, event, source) {
  database.prepare(`
    INSERT INTO stream_segments (
      event_id, stream_id, start_time, end_time, label, category_name, source, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.eventId,
    event.streamId,
    event.start,
    event.end,
    event.label,
    event.category ?? event.label,
    source,
    JSON.stringify(event),
  );
}

const eventWriters = {
  chat_message: saveChatMessage,
  viewer_sample: saveViewerSample,
  moderation_action: saveModerationAction,
  stream_marker: saveStreamMarker,
  stream_segment: saveStreamSegment,
};

export function createImportJob(job) {
  getDatabase().prepare(`
    INSERT INTO import_jobs (
      job_id, format, status, source_name, total_count, created_at
    ) VALUES (?, ?, 'processing', ?, ?, ?)
  `).run(job.jobId, job.format, job.sourceName ?? null, job.totalCount, job.createdAt);
}

export function saveImportedEvent(event, source = "import") {
  const database = getDatabase();
  database.transaction(() => {
    ensureStream(database, event);
    eventWriters[event.type](database, event, source);
  })();
}

export function saveImportError(error) {
  getDatabase().prepare(`
    INSERT INTO import_errors (job_id, row_number, event_type, message, payload_json)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    error.jobId,
    error.rowNumber,
    error.eventType ?? null,
    error.message,
    JSON.stringify(error.payload ?? null),
  );
}

export function completeImportJob(job) {
  getDatabase().prepare(`
    UPDATE import_jobs SET status = ?, stream_id = ?, success_count = ?,
      rejected_count = ?, completed_at = ? WHERE job_id = ?
  `).run(
    job.status,
    job.streamId ?? null,
    job.successCount,
    job.rejectedCount,
    job.completedAt,
    job.jobId,
  );
}

export function getImportJob(jobId) {
  return mapJob(getDatabase().prepare("SELECT * FROM import_jobs WHERE job_id = ?").get(jobId));
}

export function getImportErrors(jobId) {
  return getDatabase().prepare(`
    SELECT row_number AS rowNumber, event_type AS eventType, message, payload_json AS payloadJson
    FROM import_errors WHERE job_id = ? ORDER BY id
  `).all(jobId).map((error) => ({
    rowNumber: error.rowNumber,
    eventType: error.eventType,
    message: error.message,
    payload: parseJson(error.payloadJson, null),
  }));
}
