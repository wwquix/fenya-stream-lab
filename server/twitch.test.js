import process from "node:process";

import request from "supertest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { createApp } from "./app.js";
import { getTwitchChannelMetadata } from "./providers/twitchProvider.js";
import { resetTwitchAuthCache } from "./services/twitchAuthService.js";

const app = createApp();

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  resetTwitchAuthCache();
  process.env.TWITCH_PROVIDER = "mock";
  process.env.TWITCH_CHANNEL_LOGIN = "fenya";
  delete process.env.TWITCH_CLIENT_ID;
  delete process.env.TWITCH_CLIENT_SECRET;
  delete process.env.TWITCH_USER_ACCESS_TOKEN;
  delete process.env.TWITCH_REFRESH_TOKEN;
  delete process.env.TWITCH_BROADCASTER_ID;
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetTwitchAuthCache();
  for (const name of [
    "TWITCH_PROVIDER", "TWITCH_CHANNEL_LOGIN", "TWITCH_CLIENT_ID", "TWITCH_CLIENT_SECRET",
    "TWITCH_USER_ACCESS_TOKEN", "TWITCH_REFRESH_TOKEN", "TWITCH_BROADCASTER_ID",
  ]) delete process.env[name];
});

describe("Twitch integration foundation", () => {
  test("mock mode preserves the existing metadata response", async () => {
    const response = await request(app).get("/api/twitch/fenya");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      displayName: "Fenya",
      broadcasterId: "mock-fenya-001",
      isLive: true,
      viewerCount: 1284,
    });
  });

  test("twitch mode reports missing credentials cleanly", async () => {
    process.env.TWITCH_PROVIDER = "twitch";
    let response = await request(app).get("/api/twitch/fenya");
    expect(response.status).toBe(503);
    expect(response.body.message).toBe("Missing TWITCH_CLIENT_ID");

    process.env.TWITCH_CLIENT_ID = "client-id";
    response = await request(app).get("/api/twitch/fenya");
    expect(response.status).toBe(503);
    expect(response.body.message).toBe("Missing TWITCH_CLIENT_SECRET");
  });

  test("Helix user, channel, and stream responses normalize without real requests", async () => {
    process.env.TWITCH_CLIENT_ID = "client-id";
    process.env.TWITCH_CLIENT_SECRET = "client-secret";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "app-token", expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: "42", login: "fenya", display_name: "Fenya", profile_image_url: "https://image.test/fenya.png", description: "Streamer" }] }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ broadcaster_id: "42", broadcaster_language: "ru", game_id: "32399", game_name: "Counter-Strike 2", title: "Channel title" }] }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: "stream-7", game_id: "32399", game_name: "Counter-Strike 2", title: "Live title", viewer_count: 777, started_at: "2026-07-04T18:00:00Z", language: "ru" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getTwitchChannelMetadata("Fenya");

    expect(result).toMatchObject({
      provider: "twitch",
      channelLogin: "fenya",
      broadcasterId: "42",
      displayName: "Fenya",
      isLive: true,
      streamId: "stream-7",
      streamTitle: "Live title",
      categoryName: "Counter-Strike 2",
      categoryId: "32399",
      viewerCount: 777,
      language: "ru",
    });
    expect(result.fetchedAt).toEqual(expect.any(String));
  });

  test("connection diagnostics expose flags but never credential values", async () => {
    process.env.TWITCH_CLIENT_ID = "secret-client-id-value";
    process.env.TWITCH_CLIENT_SECRET = "secret-client-secret-value";
    process.env.TWITCH_USER_ACCESS_TOKEN = "secret-user-token-value";
    process.env.TWITCH_REFRESH_TOKEN = "secret-refresh-token-value";

    const response = await request(app).get("/api/twitch/fenya/connection");
    const serialized = JSON.stringify(response.body);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      provider: "mock",
      hasClientId: true,
      hasClientSecret: true,
      hasUserAccessToken: true,
      hasRefreshToken: true,
      appTokenAvailable: false,
    });
    expect(serialized).not.toContain("secret-client-id-value");
    expect(serialized).not.toContain("secret-client-secret-value");
    expect(serialized).not.toContain("secret-user-token-value");
    expect(serialized).not.toContain("secret-refresh-token-value");
  });
});
