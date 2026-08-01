import { getDatabase } from "../storage/db.js";

function normalizeTitle(value) {
  return String(value || "").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function titleSimilarity(first, second) {
  const a = new Set(normalizeTitle(first).split(" ").filter(Boolean));
  const b = new Set(normalizeTitle(second).split(" ").filter(Boolean));
  if (!a.size || !b.size) return 0;
  const common = [...a].filter((word) => b.has(word)).length;
  return common / Math.max(a.size, b.size);
}

function findInternalMatch(database, channelId, vod) {
  if (!channelId || !vod.createdAt) return null;
  const vodTime = new Date(vod.createdAt).getTime();
  if (!Number.isFinite(vodTime)) return null;
  const candidates = database.prepare(`
    SELECT stream_id, title, started_at FROM streams
    WHERE channel_id = ? AND source = 'twitch' AND started_at IS NOT NULL
      AND ABS(strftime('%s', started_at) - strftime('%s', ?)) <= 43200
    ORDER BY ABS(strftime('%s', started_at) - strftime('%s', ?))
    LIMIT 8
  `).all(channelId, vod.createdAt, vod.createdAt);
  let best = null;
  for (const candidate of candidates) {
    const timeDistance = Math.abs(new Date(candidate.started_at).getTime() - vodTime);
    const similarity = titleSimilarity(candidate.title, vod.title);
    const score = similarity * 2 + Math.max(0, 1 - timeDistance / (12 * 60 * 60 * 1000));
    if (!best || score > best.score) best = { ...candidate, score };
  }
  return best && best.score >= 0.45 ? best.stream_id : null;
}

export function upsertVod(channelId, vod, database = getDatabase()) {
  const match = findInternalMatch(database, channelId, vod);
  const syncedAt = new Date().toISOString();
  database.prepare(`
    INSERT INTO twitch_vods (
      channel_id, twitch_video_id, twitch_user_id, title, description, created_at,
      published_at, url, thumbnail_url, viewable, view_count, language, type,
      duration, duration_seconds, muted_segments_json, synced_at,
      has_internal_analytics, matched_stream_session_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(twitch_video_id) DO UPDATE SET
      channel_id = excluded.channel_id, twitch_user_id = excluded.twitch_user_id,
      title = excluded.title, description = excluded.description, created_at = excluded.created_at,
      published_at = excluded.published_at, url = excluded.url,
      thumbnail_url = excluded.thumbnail_url, viewable = excluded.viewable,
      view_count = excluded.view_count, language = excluded.language, type = excluded.type,
      duration = excluded.duration, duration_seconds = excluded.duration_seconds,
      muted_segments_json = excluded.muted_segments_json, synced_at = excluded.synced_at,
      has_internal_analytics = excluded.has_internal_analytics,
      matched_stream_session_id = excluded.matched_stream_session_id
  `).run(
    channelId ?? null, vod.id, vod.userId, vod.title, vod.description || null,
    vod.createdAt, vod.publishedAt || null, vod.url, vod.thumbnailUrl || null,
    vod.viewable || null, vod.viewCount || 0, vod.language || null, vod.type || "archive",
    vod.duration || null, vod.durationSeconds || 0, JSON.stringify(vod.mutedSegments ?? []),
    syncedAt, match ? 1 : 0, match,
  );
  return database.prepare("SELECT * FROM twitch_vods WHERE twitch_video_id = ?").get(vod.id);
}

export function syncVodBatch(channelId, vods, database = getDatabase()) {
  return database.transaction(() => vods.map((vod) => upsertVod(channelId, vod, database)))();
}

function boundedInteger(value, { fallback, minimum, maximum = Number.MAX_SAFE_INTEGER }) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(numeric)));
}

export function listVodsByChannel(channelId, { limit = 50, offset = 0 } = {}, database = getDatabase()) {
  const safeLimit = boundedInteger(limit, { fallback: 50, minimum: 1, maximum: 50 });
  const safeOffset = boundedInteger(offset, { fallback: 0, minimum: 0 });
  return database.prepare(`
    SELECT * FROM twitch_vods WHERE channel_id = ?
    ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?
  `).all(channelId, safeLimit, safeOffset);
}

export function getVodComparisonStats(channelId, database = getDatabase()) {
  const aggregate = database.prepare(`
    SELECT COUNT(*) AS total_vods, COALESCE(SUM(duration_seconds), 0) AS total_duration_seconds,
      COALESCE(ROUND(AVG(duration_seconds)), 0) AS average_duration_seconds
    FROM twitch_vods WHERE channel_id = ?
  `).get(channelId);
  const top = database.prepare(`
    SELECT twitch_video_id, title, view_count FROM twitch_vods
    WHERE channel_id = ? ORDER BY view_count DESC, created_at DESC LIMIT 1
  `).get(channelId) ?? null;
  const recent = database.prepare(`
    SELECT twitch_video_id, title, created_at FROM twitch_vods
    WHERE channel_id = ? ORDER BY created_at DESC LIMIT 1
  `).get(channelId) ?? null;
  return { ...aggregate, top_vod: top, most_recent_vod: recent };
}

export function markVodAnalyticsMatch(channelId, twitchVideoId, streamSessionId, database = getDatabase()) {
  return database.prepare(`
    UPDATE twitch_vods SET has_internal_analytics = ?, matched_stream_session_id = ?
    WHERE channel_id = ? AND twitch_video_id = ?
  `).run(streamSessionId ? 1 : 0, streamSessionId || null, channelId, twitchVideoId).changes > 0;
}
