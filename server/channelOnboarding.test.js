import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

import request from "supertest";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { createApp } from "./app.js";
import { findOrCreateUserFromTwitchProfile } from "./repositories/userRepository.js";
import { findOrCreateChannelFromBroadcaster } from "./repositories/channelRepository.js";
import { addOrUpdateChannelMembership } from "./repositories/membershipRepository.js";
import { SESSION_COOKIE_NAME, startSession } from "./services/sessionService.js";
import { closeDatabase, getDatabase } from "./storage/db.js";

let app;
let tempDirectory;
let cookie;
let user;

beforeEach(() => {
  tempDirectory = mkdtempSync(join(tmpdir(), "fenya-onboarding-"));
  process.env.DATABASE_PATH = join(tempDirectory, "test.sqlite");
  user = findOrCreateUserFromTwitchProfile({
    id: "onboarding-user-42",
    login: "new_streamer",
    display_name: "New Streamer",
    profile_image_url: "https://images.test/new-streamer.png",
  });
  const ownedChannel = findOrCreateChannelFromBroadcaster({
    id: "onboarding-user-42", login: "new_streamer", display_name: "New Streamer",
    profile_image_url: "https://images.test/new-streamer.png",
  }, user.id);
  addOrUpdateChannelMembership(ownedChannel.id, user.id, "channel_owner");
  cookie = `${SESSION_COOKIE_NAME}=${startSession(user.id).rawToken}`;
  app = createApp();
});

afterEach(() => {
  closeDatabase();
  delete process.env.DATABASE_PATH;
  rmSync(tempDirectory, { recursive: true, force: true });
});

describe("streamer channel onboarding", () => {
  test("existing channel owner can reconnect their Twitch channel", async () => {
    const response = await request(app).post("/api/channels/connect-my-channel").set("Cookie", cookie);
    expect(response.status).toBe(200);
    expect(response.body.channel).toMatchObject({
      twitchBroadcasterId: "onboarding-user-42",
      twitchLogin: "new_streamer",
      displayName: "New Streamer",
      role: "channel_owner",
    });
  });

  test("guest cannot connect a channel", async () => {
    const response = await request(app).post("/api/channels/connect-my-channel");
    expect(response.status).toBe(401);
  });

  test("chatter without an owned channel cannot change Twitch connection", async () => {
    const chatter = findOrCreateUserFromTwitchProfile({ id: "onboarding-chatter", login: "viewer", display_name: "Viewer" });
    const chatterCookie = `${SESSION_COOKIE_NAME}=${startSession(chatter.id).rawToken}`;
    const response = await request(app).post("/api/channels/connect-my-channel").set("Cookie", chatterCookie);
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "forbidden", message: "Insufficient permissions" });
  });

  test("repeated channel connection is idempotent", async () => {
    const first = await request(app).post("/api/channels/connect-my-channel").set("Cookie", cookie);
    const second = await request(app).post("/api/channels/connect-my-channel").set("Cookie", cookie);
    expect(second.status).toBe(200);
    expect(second.body.channel.id).toBe(first.body.channel.id);
    expect(getDatabase().prepare("SELECT COUNT(*) AS count FROM channels").get().count).toBe(1);
  });

  test("connected user receives channel_owner membership", async () => {
    await request(app).post("/api/channels/connect-my-channel").set("Cookie", cookie);
    const membership = getDatabase().prepare("SELECT user_id, role FROM channel_memberships").get();
    expect(membership).toEqual({ user_id: user.id, role: "channel_owner" });
  });

  test("api/channels/mine returns the owned channel", async () => {
    await request(app).post("/api/channels/connect-my-channel").set("Cookie", cookie);
    const response = await request(app).get("/api/channels/mine").set("Cookie", cookie);
    expect(response.status).toBe(200);
    expect(response.body.channels).toEqual([
      expect.objectContaining({ twitchLogin: "new_streamer", role: "channel_owner", isActive: true }),
    ]);
  });

  test("api/channels/mine reports a safe reauth requirement when chat scope is missing", async () => {
    await request(app).post("/api/channels/connect-my-channel").set("Cookie", cookie);
    const response = await request(app).get("/api/channels/mine").set("Cookie", cookie);
    const serialized = JSON.stringify(response.body).toLowerCase();

    expect(response.body.channels[0]).toMatchObject({
      needsReauth: true,
      missingScopes: ["user:read:chat"],
      message: "Нужно повторно войти через Twitch и выдать доступ к чтению чата.",
    });
    for (const forbidden of ["access_token", "refresh_token", "encrypted", "client_secret", "session_token", "token_hash"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  test("moderator directory reports missing scope without exposing secrets", async () => {
    const connected = await request(app).post("/api/channels/connect-my-channel").set("Cookie", cookie);
    const channelId = connected.body.channel.id;
    const response = await request(app).get(`/api/channels/${channelId}/moderators`);
    const serialized = JSON.stringify(response.body).toLowerCase();

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      available: false,
      missingScopes: ["moderation:read"],
      moderators: [],
    });
    expect(response.body.message).toContain("moderation:read");
    for (const forbidden of ["access_token", "refresh_token", "encrypted", "client_secret", "session_token", "token_hash"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  test("owner moderator sync returns missing-scope state instead of failing", async () => {
    const connected = await request(app).post("/api/channels/connect-my-channel").set("Cookie", cookie);
    const response = await request(app).post(`/api/channels/${connected.body.channel.id}/moderators/sync`).set("Cookie", cookie);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ available: false, missingScopes: ["moderation:read"] });
  });
});
