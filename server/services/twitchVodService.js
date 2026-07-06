import { HttpError } from "../middleware/errorHandlers.js";
import { syncVodBatch } from "../repositories/twitchVodRepository.js";
import { twitchHelixRequest } from "./twitchHelixClient.js";

export function parseTwitchDuration(duration) {
  const value = String(duration || "").trim().toLowerCase();
  if (!value) return 0;
  const match = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!match || !match.slice(1).some(Boolean)) return 0;
  return Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0);
}

function normalizeVod(vod) {
  return {
    id: vod.id,
    userId: vod.user_id,
    title: vod.title || "Untitled Twitch VOD",
    description: vod.description || "",
    createdAt: vod.created_at,
    publishedAt: vod.published_at || vod.created_at,
    url: vod.url,
    thumbnailUrl: vod.thumbnail_url || null,
    viewable: vod.viewable || null,
    viewCount: Number(vod.view_count || 0),
    language: vod.language || null,
    type: vod.type || "archive",
    duration: vod.duration || "",
    durationSeconds: parseTwitchDuration(vod.duration),
    mutedSegments: Array.isArray(vod.muted_segments) ? vod.muted_segments : [],
  };
}

export async function getTwitchVideosByBroadcaster(broadcasterId, { limit = 50, twitchAccountId } = {}) {
  if (!broadcasterId) throw new HttpError(400, "Twitch broadcaster id is required");
  const target = Math.min(50, Math.max(1, Number(limit) || 50));
  const videos = [];
  const seenCursors = new Set();
  let cursor = null;
  for (let page = 0; page < 10 && videos.length < target; page += 1) {
    const query = new URLSearchParams({ user_id: String(broadcasterId), type: "archive", first: "100" });
    if (cursor) query.set("after", cursor);
    const payload = await twitchHelixRequest(`/videos?${query}`, twitchAccountId ? { twitchAccountId } : {});
    for (const vod of payload.data ?? []) {
      if (vod?.id && !videos.some((item) => item.id === vod.id)) videos.push(normalizeVod(vod));
      if (videos.length >= target) break;
    }
    const nextCursor = payload.pagination?.cursor;
    if (!nextCursor || seenCursors.has(nextCursor)) break;
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }
  return videos.slice(0, target);
}

export async function syncTwitchVods(channelId, broadcasterId, options = {}) {
  const vods = await getTwitchVideosByBroadcaster(broadcasterId, options);
  const rows = syncVodBatch(channelId, vods);
  return { syncedCount: rows.length, vods: rows };
}
