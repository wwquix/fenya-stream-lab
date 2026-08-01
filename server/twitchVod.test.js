import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { findOrCreateChannelFromBroadcaster } from "./repositories/channelRepository.js";
import {
  getVodComparisonStats,
  listVodsByChannel,
  markVodAnalyticsMatch,
  syncVodBatch,
  upsertVod,
} from "./repositories/twitchVodRepository.js";
import { resetTwitchAuthCache } from "./services/twitchAuthService.js";
import { getTwitchVideosByBroadcaster, parseTwitchDuration } from "./services/twitchVodService.js";
import { closeDatabase, getDatabase } from "./storage/db.js";

let temporaryDirectory;
let channel;

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

function vod(id, createdAt = "2026-07-01T18:00:00Z", overrides = {}) {
  return {
    id: String(id), userId: "broadcaster-1", title: `VOD ${id}`, description: "",
    createdAt, publishedAt: createdAt, url: `https://twitch.tv/videos/${id}`,
    thumbnailUrl: null, viewable: "public", viewCount: Number(id), language: "ru",
    type: "archive", duration: "1h2m", durationSeconds: 3720, mutedSegments: [], ...overrides,
  };
}

function helixVod(id) {
  const item = vod(id);
  return {
    id: item.id, user_id: item.userId, title: item.title, description: item.description,
    created_at: item.createdAt, published_at: item.publishedAt, url: item.url,
    thumbnail_url: "", viewable: item.viewable, view_count: item.viewCount,
    language: item.language, type: item.type, duration: item.duration, muted_segments: [],
  };
}

beforeEach(() => {
  temporaryDirectory = mkdtempSync(join(tmpdir(), "fenya-vods-"));
  process.env.DATABASE_PATH = join(temporaryDirectory, "test.sqlite");
  process.env.TWITCH_CLIENT_ID = "client-id";
  process.env.TWITCH_CLIENT_SECRET = "client-secret";
  resetTwitchAuthCache();
  channel = findOrCreateChannelFromBroadcaster({ id: "broadcaster-1", login: "channel1", display_name: "Channel 1" });
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetTwitchAuthCache();
  closeDatabase();
  delete process.env.DATABASE_PATH;
  delete process.env.TWITCH_CLIENT_ID;
  delete process.env.TWITCH_CLIENT_SECRET;
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

describe("Twitch VOD archive", () => {
  test("parses Twitch duration formats", () => {
    expect(parseTwitchDuration("3h42m10s")).toBe(13330);
    expect(parseTwitchDuration("58m20s")).toBe(3500);
    expect(parseTwitchDuration("1h2m")).toBe(3720);
    expect(parseTwitchDuration("45s")).toBe(45);
    expect(parseTwitchDuration("bad")).toBe(0);
  });

  test("fetches at most 50 VODs across cursor pages", async () => {
    const first = Array.from({ length: 30 }, (_, index) => helixVod(index + 1));
    const second = Array.from({ length: 30 }, (_, index) => helixVod(index + 31));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "app-token", expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ data: first, pagination: { cursor: "page-2" } }))
      .mockResolvedValueOnce(jsonResponse({ data: second, pagination: {} }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await getTwitchVideosByBroadcaster("broadcaster-1");
    expect(result).toHaveLength(50);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test("pagination stops when Twitch repeats a cursor", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "app-token", expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ data: [helixVod(1)], pagination: { cursor: "same" } }))
      .mockResolvedValueOnce(jsonResponse({ data: [helixVod(2)], pagination: { cursor: "same" } }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await getTwitchVideosByBroadcaster("broadcaster-1")).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test("upsert avoids duplicates and list returns newest first", () => {
    upsertVod(channel.id, vod(1, "2026-07-01T18:00:00Z"));
    upsertVod(channel.id, vod(1, "2026-07-01T18:00:00Z", { viewCount: 999 }));
    upsertVod(channel.id, vod(2, "2026-07-02T18:00:00Z"));
    const rows = listVodsByChannel(channel.id);
    expect(rows.map((row) => row.twitch_video_id)).toEqual(["2", "1"]);
    expect(rows[1].view_count).toBe(999);
    expect(getDatabase().prepare("SELECT COUNT(*) AS count FROM twitch_vods").get().count).toBe(2);
  });

  test("normalizes fractional and non-finite VOD pagination values", () => {
    syncVodBatch(channel.id, [
      vod(1, "2026-07-01T18:00:00Z"),
      vod(2, "2026-07-02T18:00:00Z"),
      vod(3, "2026-07-03T18:00:00Z"),
    ]);

    expect(listVodsByChannel(channel.id, { limit: "1.9", offset: "1.8" }).map((row) => row.twitch_video_id))
      .toEqual(["2"]);
    expect(listVodsByChannel(channel.id, { limit: "Infinity", offset: "Infinity" })).toHaveLength(3);
    expect(listVodsByChannel(channel.id, { limit: "-5", offset: "-5" }).map((row) => row.twitch_video_id))
      .toEqual(["3"]);
  });

  test("VOD-only rows never claim internal analytics", () => {
    const row = upsertVod(channel.id, vod(1));
    expect(row.has_internal_analytics).toBe(0);
    expect(row.matched_stream_session_id).toBeNull();
  });

  test("nearby collected Twitch stream can be matched without fabricating metrics", () => {
    getDatabase().prepare(`
      INSERT INTO streams (stream_id, channel_id, channel_login, title, started_at, source, status)
      VALUES ('stream-match', ?, 'channel1', 'VOD 7', '2026-07-01T18:05:00Z', 'twitch', 'completed')
    `).run(channel.id);
    const row = upsertVod(channel.id, vod(7));
    expect(row.has_internal_analytics).toBe(1);
    expect(row.matched_stream_session_id).toBe("stream-match");
  });

  test("comparison uses metadata duration/views only", () => {
    syncVodBatch(channel.id, [vod(1, "2026-07-01T18:00:00Z", { durationSeconds: 100 }), vod(2, "2026-07-02T18:00:00Z", { durationSeconds: 300 })]);
    const stats = getVodComparisonStats(channel.id);
    expect(stats).toMatchObject({ total_vods: 2, total_duration_seconds: 400, average_duration_seconds: 200 });
    expect(stats.top_vod.twitch_video_id).toBe("2");
    expect(stats).not.toHaveProperty("messages");
  });

  test("manual analytics match can be added or removed safely", () => {
    upsertVod(channel.id, vod(3));
    getDatabase().prepare(`INSERT INTO streams (stream_id, channel_id, title, source) VALUES ('manual-stream', ?, 'Manual', 'twitch')`).run(channel.id);
    expect(markVodAnalyticsMatch(channel.id, "3", "manual-stream")).toBe(true);
    expect(listVodsByChannel(channel.id)[0].has_internal_analytics).toBe(1);
    expect(markVodAnalyticsMatch(channel.id, "3", null)).toBe(true);
    expect(listVodsByChannel(channel.id)[0].has_internal_analytics).toBe(0);
  });
});
