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
  closeDatabase();
  for (const name of [
    "DATABASE_PATH", "TWITCH_PROVIDER", "TWITCH_CHANNEL_LOGIN", "TWITCH_CLIENT_ID",
    "TWITCH_CLIENT_SECRET", "TWITCH_USER_ACCESS_TOKEN", "TWITCH_REFRESH_TOKEN",
    "TWITCH_BROADCASTER_ID", "TWITCH_BOT_USER_ID", "TWITCH_POLL_INTERVAL_MS",
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
    expect(database.prepare("SELECT total_messages, unique_chatters FROM streams WHERE stream_id = 'live-1'").get())
      .toMatchObject({ total_messages: 1, unique_chatters: 1 });
  });

  test("ingest routes stay safe and mock mode does not open EventSub", async () => {
    const status = await request(app).get("/api/twitch/fenya/ingest/status");
    expect(status.status).toBe(200);
    expect(status.body).toMatchObject({ provider: "mock", status: "stopped", running: false });

    const started = await request(app).post("/api/twitch/fenya/ingest/start");
    expect(started.status).toBe(409);
    expect(started.body.message).toBe("Twitch ingest requires TWITCH_PROVIDER=twitch");
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

    const socket = new FakeWebSocket();
    setTwitchWebSocketFactoryForTests(() => {
      queueMicrotask(() => socket.emit("message", JSON.stringify({
        metadata: { message_type: "session_welcome" },
        payload: { session: { id: "session-1", connected_at: "2026-07-04T18:05:00Z", keepalive_timeout_seconds: 30 } },
      })));
      return socket;
    });

    const started = await startTwitchIngest();
    expect(started).toMatchObject({ status: "running", subscriptionId: "subscription-1", broadcasterId: "42", chatUserId: "77" });
    expect(fetchMock.mock.calls[5][1]).toMatchObject({ method: "POST" });
    expect(JSON.parse(fetchMock.mock.calls[5][1].body)).toMatchObject({
      type: "channel.chat.message",
      condition: { broadcaster_user_id: "42", user_id: "77" },
      transport: { method: "websocket", session_id: "session-1" },
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
});
