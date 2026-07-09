import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

import request from "supertest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { createApp } from "./app.js";
import { saveTwitchChatMessage, saveTwitchStreamSnapshot } from "./repositories/twitchIngestRepository.js";
import { resetTwitchAuthCache } from "./services/twitchAuthService.js";
import {
  getTwitchIngestStatus,
  resetTwitchIngestForTests,
  setTwitchWebSocketFactoryForTests,
  startTwitchIngest,
} from "./services/twitchIngestService.js";
import { closeDatabase, getDatabase } from "./storage/db.js";
import { findOrCreateUserFromTwitchProfile } from "./repositories/userRepository.js";
import { SESSION_COOKIE_NAME, startSession } from "./services/sessionService.js";

const app = createApp();
let temporaryDirectory;

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

class FakeWebSocket extends EventEmitter {
  close() {
    this.emit("close");
  }

  terminate() {
    this.emit("close");
  }
}

beforeEach(async () => {
  closeDatabase();
  resetTwitchAuthCache();
  resetTwitchIngestForTests();
  temporaryDirectory = await mkdtemp(join(tmpdir(), "fenya-twitch-ingest-test-"));
  process.env.DATABASE_PATH = join(temporaryDirectory, "test.sqlite");
  process.env.TWITCH_PROVIDER = "mock";
  process.env.TWITCH_CHANNEL_LOGIN = "fenya";
});

afterEach(async () => {
  resetTwitchIngestForTests();
  resetTwitchAuthCache();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  closeDatabase();
  for (const name of [
    "DATABASE_PATH", "TWITCH_PROVIDER", "TWITCH_CHANNEL_LOGIN", "TWITCH_CLIENT_ID",
    "TWITCH_CLIENT_SECRET", "TWITCH_USER_ACCESS_TOKEN", "TWITCH_REFRESH_TOKEN",
    "TWITCH_BROADCASTER_ID", "TWITCH_BOT_USER_ID", "TWITCH_POLL_INTERVAL_MS",
    "TWITCH_EVENTSUB_RECONNECT_MS", "TWITCH_LIVE_INGEST_AUTOSTART",
    "PLATFORM_ADMIN_TWITCH_LOGINS",
  ]) delete process.env[name];
  await rm(temporaryDirectory, { recursive: true, force: true });
});

describe("Twitch ingest pipeline", () => {
  test("stream polling snapshots and EventSub chat update all SQLite aggregates", () => {
    const metadata = {
      provider: "twitch",
      channelLogin: "fenya",
      broadcasterId: "42",
      isLive: true,
      streamId: "live-1",
      streamTitle: "Live title",
      categoryName: "Counter-Strike 2",
      viewerCount: 900,
      startedAt: "2026-07-04T18:00:00.000Z",
    };
    saveTwitchStreamSnapshot(metadata, "2026-07-04T18:05:00.000Z");
    const event = {
      broadcaster_user_id: "42",
      broadcaster_user_login: "fenya",
      chatter_user_id: "77",
      chatter_user_login: "viewer77",
      message_id: "message-1",
      message: { text: "Красивый clutch красивый" },
    };

    expect(saveTwitchChatMessage(event, "2026-07-04T18:05:20.000Z").stored).toBe(true);
    expect(saveTwitchChatMessage(event, "2026-07-04T18:05:21.000Z").stored).toBe(false);

    const database = getDatabase();
    expect(database.prepare("SELECT COUNT(*) AS count FROM viewer_samples").get().count).toBe(1);
    expect(database.prepare("SELECT COUNT(*) AS count FROM chat_messages").get().count).toBe(1);
    expect(database.prepare("SELECT message_count FROM chatters WHERE nickname = 'viewer77'").get().message_count).toBe(1);
    expect(database.prepare("SELECT count FROM word_stats WHERE word_text = 'красивый'").get().count).toBe(2);
    expect(database.prepare("SELECT total_messages, unique_chatters, started_at, collected_from FROM streams WHERE stream_id = 'live-1'").get())
      .toMatchObject({
        total_messages: 1,
        unique_chatters: 1,
        started_at: "2026-07-04T18:00:00.000Z",
        collected_from: "2026-07-04T18:05:00.000Z",
      });
  });

  test("continuing the same live stream preserves its earliest collection boundary", () => {
    const metadata = {
      provider: "twitch",
      channelLogin: "fenya",
      broadcasterId: "42",
      isLive: true,
      streamId: "continued-live",
      streamTitle: "Already live",
      categoryName: "Twitch",
      viewerCount: 100,
      startedAt: "2026-07-04T18:00:00.000Z",
    };

    saveTwitchStreamSnapshot(metadata, "2026-07-04T18:30:00.000Z", { collectedFrom: "2026-07-04T18:30:00.000Z" });
    saveTwitchStreamSnapshot(metadata, "2026-07-04T18:45:00.000Z", { collectedFrom: "2026-07-04T18:45:00.000Z" });

    expect(getDatabase().prepare("SELECT started_at, collected_from FROM streams WHERE stream_id = 'continued-live'").get())
      .toEqual({
        started_at: "2026-07-04T18:00:00.000Z",
        collected_from: "2026-07-04T18:30:00.000Z",
      });
  });

  test("ingest routes stay safe and mock mode does not open EventSub", async () => {
    process.env.TWITCH_USER_ACCESS_TOKEN = "must-not-appear-user-token";
    process.env.TWITCH_REFRESH_TOKEN = "must-not-appear-refresh-token";
    process.env.TWITCH_EVENTSUB_RECONNECT_MS = "5000";
    const status = await request(app).get("/api/twitch/fenya/ingest/status");
    expect(status.status).toBe(200);
    expect(status.body).toMatchObject({
      provider: "mock",
      status: "stopped",
      running: false,
      persistedMessagesStored: 0,
      reconnectIntervalMs: 5000,
    });
    expect(JSON.stringify(status.body)).not.toContain("must-not-appear-user-token");
    expect(JSON.stringify(status.body)).not.toContain("must-not-appear-refresh-token");

    const platformAdmin = findOrCreateUserFromTwitchProfile({ id: "mock-admin", login: "wwquix", display_name: "Admin" });
    process.env.PLATFORM_ADMIN_TWITCH_LOGINS = "wwquix";
    const adminCookie = `${SESSION_COOKIE_NAME}=${startSession(platformAdmin.id).rawToken}`;
    const started = await request(app).post("/api/twitch/fenya/ingest/start").set("Cookie", adminCookie);
    expect(started.status).toBe(409);
    expect(started.body.message).toBe("Twitch ingest requires TWITCH_PROVIDER=twitch");
  });

  test("twitch mode never returns seeded mock dashboard data as real data", async () => {
    const database = getDatabase();
    database.prepare(`
      INSERT INTO streams (
        stream_id, title, category_name, started_at, duration_minutes,
        status, source, is_current
      ) VALUES ('mock-stream', 'Demo stream', 'Demo', '2026-07-01T18:00:00Z', 120, 'completed', 'mock', 1)
    `).run();
    database.prepare(`
      INSERT INTO viewer_samples (
        event_id, stream_id, sampled_at, time_label, viewers, messages_per_minute, source
      ) VALUES ('mock-viewer', 'mock-stream', '2026-07-01T18:01:00Z', '18:01', 9999, 999, 'mock')
    `).run();
    process.env.TWITCH_PROVIDER = "twitch";

    const [analytics, archive, chat, words, moderation] = await Promise.all([
      request(app).get("/api/analytics/fenya/current-stream"),
      request(app).get("/api/archive/fenya/streams"),
      request(app).get("/api/chat/fenya/current-stream"),
      request(app).get("/api/words/fenya/current-stream"),
      request(app).get("/api/moderation/fenya/current-stream"),
    ]);

    expect([analytics.status, archive.status, chat.status, words.status, moderation.status])
      .toEqual([204, 204, 204, 204, 204]);
  });

  test("twitch mode keeps the latest collected real data visible after the stream goes offline", async () => {
    const metadata = {
      provider: "twitch",
      channelLogin: "fenya",
      broadcasterId: "42",
      isLive: true,
      streamId: "finished-live-stream",
      streamTitle: "Collected stream",
      categoryName: "Counter-Strike 2",
      viewerCount: 321,
      startedAt: "2026-07-04T18:00:00.000Z",
    };
    saveTwitchStreamSnapshot(metadata, "2026-07-04T18:05:00.000Z");
    saveTwitchStreamSnapshot({ ...metadata, isLive: false, streamId: null }, "2026-07-04T19:00:00.000Z");
    process.env.TWITCH_PROVIDER = "twitch";

    const response = await request(app).get("/api/analytics/fenya/current-stream");
    const archive = await request(app).get("/api/archive/fenya/streams");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ streamId: "finished-live-stream", title: "Collected stream" });
    expect(response.body.points).toHaveLength(1);
    expect(archive.status).toBe(200);
    expect(archive.body.streams[0]).toMatchObject({
      streamId: "finished-live-stream",
      status: "completed",
      durationMinutes: 60,
      averageViewers: 321,
      peakViewers: 321,
    });
  });

  test("start validates user:read:chat, subscribes, and stores notifications", async () => {
    process.env.TWITCH_PROVIDER = "twitch";
    process.env.TWITCH_CLIENT_ID = "client-id";
    process.env.TWITCH_CLIENT_SECRET = "client-secret";
    process.env.TWITCH_USER_ACCESS_TOKEN = "user-token";
    process.env.TWITCH_BOT_USER_ID = "77";

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ user_id: "77", login: "bot", scopes: ["user:read:chat"], expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ access_token: "app-token", expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: "42", login: "fenya", display_name: "Fenya" }] }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ broadcaster_id: "42", game_id: "32399", game_name: "Counter-Strike 2", title: "Channel title" }] }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: "live-2", game_id: "32399", game_name: "Counter-Strike 2", title: "Live", viewer_count: 1000, started_at: "2026-07-04T18:00:00Z", language: "ru" }] }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: "subscription-1", status: "enabled" }] }, 202));
    vi.stubGlobal("fetch", fetchMock);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const socket = new FakeWebSocket();
    setTwitchWebSocketFactoryForTests(() => {
      queueMicrotask(() => socket.emit("message", JSON.stringify({
        metadata: { message_type: "session_welcome" },
        payload: { session: { id: "session-1", connected_at: "2026-07-04T18:05:00Z", keepalive_timeout_seconds: 30 } },
      })));
      return socket;
    });

    const started = await startTwitchIngest();
    expect(started).toMatchObject({
      status: "running",
      subscriptionId: "subscription-1",
      broadcasterId: "42",
      chatUserId: "77",
      streamStartedAt: "2026-07-04T18:00:00Z",
      collectedFrom: expect.any(String),
    });
    const safeLogs = logSpy.mock.calls.flat().join(" ");
    expect(safeLogs).toContain("channel=@fenya");
    expect(safeLogs).toContain("collectedFrom=");
    expect(safeLogs).not.toContain("user-token");
    expect(safeLogs).not.toContain("client-secret");
    expect(getDatabase().prepare("SELECT collected_from FROM streams WHERE stream_id = 'live-2'").get().collected_from)
      .toBe(started.collectedFrom);
    expect(fetchMock.mock.calls[5][1]).toMatchObject({ method: "POST" });
    expect(JSON.parse(fetchMock.mock.calls[5][1].body)).toMatchObject({
      type: "channel.chat.message",
      condition: { broadcaster_user_id: "42", user_id: "77" },
      transport: { method: "websocket", session_id: "session-1" },
    });

    const platformAdmin = findOrCreateUserFromTwitchProfile({ id: "legacy-admin", login: "wwquix", display_name: "Admin" });
    process.env.PLATFORM_ADMIN_TWITCH_LOGINS = "wwquix";
    const adminCookie = `${SESSION_COOKIE_NAME}=${startSession(platformAdmin.id).rawToken}`;
    const compatibilityStart = await request(app).post("/api/twitch/fenya/ingest/start").set("Cookie", adminCookie);
    expect(compatibilityStart.status).toBe(202);
    expect(compatibilityStart.body).toMatchObject({
      channelId: "legacy:fenya",
      running: true,
      broadcasterId: "42",
      chatReaderUserId: "77",
      subscriptionId: "subscription-1",
    });

    socket.emit("message", JSON.stringify({
      metadata: { message_type: "notification", message_timestamp: "2026-07-04T18:06:00Z" },
      payload: {
        subscription: { type: "channel.chat.message" },
        event: {
          broadcaster_user_id: "42", broadcaster_user_login: "fenya",
          chatter_user_id: "88", chatter_user_login: "viewer88",
          message_id: "eventsub-message-1", message: { text: "Вот это clutch" },
        },
      },
    }));

    expect(getTwitchIngestStatus()).toMatchObject({ running: true, messagesStored: 1, currentStreamId: "live-2" });
    expect(getDatabase().prepare("SELECT COUNT(*) AS count FROM chat_messages").get().count).toBe(1);
  });

  test("start fails cleanly when the user token lacks chat scope", async () => {
    process.env.TWITCH_PROVIDER = "twitch";
    process.env.TWITCH_CLIENT_ID = "client-id";
    process.env.TWITCH_CLIENT_SECRET = "client-secret";
    process.env.TWITCH_USER_ACCESS_TOKEN = "user-token";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ user_id: "77", scopes: [] })));

    await expect(startTwitchIngest()).rejects.toMatchObject({
      status: 403,
      message: "Twitch user token requires scope user:read:chat",
    });
  });

  test("start fails safely when the validated token has no chat reader id", async () => {
    process.env.TWITCH_PROVIDER = "twitch";
    process.env.TWITCH_USER_ACCESS_TOKEN = "user-token";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ scopes: ["user:read:chat"] })));

    await expect(startTwitchIngest()).rejects.toMatchObject({
      status: 401,
      message: "Validated Twitch user token has no chat reader user id",
    });
  });

  test("EventSub subscription failure returns a safe specific error", async () => {
    process.env.TWITCH_PROVIDER = "twitch";
    process.env.TWITCH_CLIENT_ID = "client-id";
    process.env.TWITCH_CLIENT_SECRET = "client-secret";
    process.env.TWITCH_USER_ACCESS_TOKEN = "user-token";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ user_id: "77", scopes: ["user:read:chat"] }))
      .mockResolvedValueOnce(jsonResponse({ access_token: "app-token", expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: "42", login: "fenya", display_name: "Fenya" }] }))
      .mockResolvedValueOnce(jsonResponse({ data: [{}] }))
      .mockResolvedValueOnce(jsonResponse({ data: [] }))
      .mockResolvedValueOnce(jsonResponse({ message: "subscription rejected" }, 403));
    vi.stubGlobal("fetch", fetchMock);
    const socket = new FakeWebSocket();
    setTwitchWebSocketFactoryForTests(() => {
      queueMicrotask(() => socket.emit("message", JSON.stringify({
        metadata: { message_type: "session_welcome" },
        payload: { session: { id: "failed-session", keepalive_timeout_seconds: 30 } },
      })));
      return socket;
    });

    await expect(startTwitchIngest()).rejects.toMatchObject({
      status: 502,
      message: "Twitch EventSub subscription failed",
    });
    expect(getTwitchIngestStatus()).toMatchObject({ status: "error", running: false, lastError: "Twitch EventSub subscription failed" });
  });
});
