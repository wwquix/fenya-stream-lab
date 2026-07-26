import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

import request from "supertest";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { createApp } from "./app.js";
import { findOrCreateChannelFromBroadcaster } from "./repositories/channelRepository.js";
import { addOrUpdateChannelMembership } from "./repositories/membershipRepository.js";
import { findOrCreateUserFromTwitchProfile } from "./repositories/userRepository.js";
import { generateLocalSummary } from "./providers/localSummaryProvider.js";
import { SESSION_COOKIE_NAME, startSession } from "./services/sessionService.js";
import { closeDatabase, getDatabase } from "./storage/db.js";

const BASE_TIME = Date.parse("2026-07-20T18:00:00.000Z");

let app;
let temporaryDirectory;
let channelA;
let channelB;
let cookies;

function timestamp(minute) {
  return new Date(BASE_TIME + minute * 60_000).toISOString();
}

function timeLabel(minute) {
  const date = new Date(BASE_TIME + minute * 60_000);
  return `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
}

function profile(id, login) {
  return { id, login, display_name: login, profile_image_url: null };
}

function sessionCookie(userId) {
  return `${SESSION_COOKIE_NAME}=${startSession(userId).rawToken}`;
}

function insertStream({
  streamId,
  channel = null,
  channelLogin = "fenya",
  source = "twitch",
  startMinute = 0,
  collectedMinute = startMinute,
  title = `Stream ${streamId}`,
}) {
  getDatabase().prepare(`
    INSERT INTO streams (
      stream_id, channel_id, channel_login, title, started_at, collected_from,
      ended_at, status, source, is_current
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', ?, 0)
  `).run(
    streamId,
    channel?.id ?? null,
    channel?.twitch_login ?? channelLogin,
    title,
    timestamp(startMinute),
    timestamp(collectedMinute),
    timestamp(startMinute + 180),
    source,
  );
}

function insertMessage({
  streamId,
  channel = null,
  login,
  minute,
  source = "twitch",
  suffix = "",
}) {
  getDatabase().prepare(`
    INSERT INTO chat_messages (
      event_id, stream_id, channel_id, sent_at, time_label, chatter_login,
      message_text, message_type, source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'normal', ?)
  `).run(
    `message:${streamId}:${login}:${minute}:${suffix}`,
    streamId,
    channel?.id ?? null,
    timestamp(minute),
    timeLabel(minute),
    login,
    "Saved test message",
    source,
  );
}

function insertSample({
  streamId,
  channel = null,
  minute,
  viewers,
  messagesPerMinute,
  source = "twitch",
}) {
  getDatabase().prepare(`
    INSERT INTO viewer_samples (
      event_id, stream_id, channel_id, sampled_at, time_label, viewers,
      messages_per_minute, source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    `sample:${streamId}:${minute}`,
    streamId,
    channel?.id ?? null,
    timestamp(minute),
    timeLabel(minute),
    viewers,
    messagesPerMinute,
    source,
  );
}

function insertMarker({
  streamId,
  minute,
  label = "Saved marker",
  source = "twitch",
}) {
  getDatabase().prepare(`
    INSERT INTO stream_markers (
      event_id, stream_id, occurred_at, time_label, label, marker_type, source
    ) VALUES (?, ?, ?, ?, ?, 'highlight', ?)
  `).run(
    `marker:${streamId}:${minute}`,
    streamId,
    timestamp(minute),
    timeLabel(minute),
    label,
    source,
  );
}

function seedAdvancedAnalyticsRows() {
  for (let index = 1; index <= 5; index += 1) {
    insertStream({
      streamId: `a-${index}`,
      channel: channelA,
      startMinute: index * 24 * 60,
    });
  }
  insertStream({
    streamId: "a-mock",
    channel: channelA,
    source: "mock",
    startMinute: 7 * 24 * 60,
  });
  insertStream({
    streamId: "b-1",
    channel: channelB,
    startMinute: 6 * 24 * 60,
  });
  const legacyStartMinute = 8 * 24 * 60;
  insertStream({
    streamId: "legacy-1",
    source: "mock",
    startMinute: legacyStartMinute,
  });

  insertMessage({ streamId: "a-1", channel: channelA, login: "regular_user", minute: 1 });
  insertMessage({ streamId: "a-3", channel: channelA, login: "regular_user", minute: 2 });
  insertMessage({ streamId: "a-5", channel: channelA, login: "REGULAR_USER", minute: 3 });
  insertMessage({ streamId: "a-4", channel: channelA, login: "returning_user", minute: 4 });
  insertMessage({ streamId: "a-5", channel: channelA, login: "returning_user", minute: 5 });
  insertMessage({ streamId: "a-5", channel: channelA, login: "new_user", minute: 6 });
  insertMessage({
    streamId: "a-5",
    channel: channelA,
    login: "same_stream_mock_user",
    minute: 7,
    source: "mock",
  });
  insertMessage({
    streamId: "a-mock",
    channel: channelA,
    login: "mock_only_user",
    minute: 7,
    source: "mock",
  });
  getDatabase().prepare(`
    INSERT INTO chatters (stream_id, nickname, message_count, updated_at)
    VALUES ('a-5', 'unsourced_aggregate_user', 999, ?)
  `).run(timestamp(9));
  insertMessage({ streamId: "b-1", channel: channelB, login: "other_channel_user", minute: 8 });
  for (const [index, login] of ["legacy_regular", "legacy_returning", "legacy_new"].entries()) {
    insertMessage({
      streamId: "legacy-1",
      login,
      minute: legacyStartMinute + index + 1,
      source: "mock",
    });
  }

  const viewers = [100, 101, 99, 100, 105, 220, 240, 210, 108, 104, 102, 100];
  const chat = [5, 5, 5, 6, 7, 30, 42, 28, 7, 6, 5, 5];
  viewers.forEach((value, index) => {
    insertSample({
      streamId: "a-5",
      channel: channelA,
      minute: index * 3,
      viewers: value,
      messagesPerMinute: chat[index],
    });
  });
  insertMarker({ streamId: "a-5", minute: 18, label: "Clutch marker" });
  insertMarker({
    streamId: "a-5",
    minute: 19,
    label: "Mock marker on Twitch stream",
    source: "mock",
  });
  insertSample({
    streamId: "a-5",
    channel: channelA,
    minute: 99,
    viewers: 99_999,
    messagesPerMinute: 99_999,
    source: "mock",
  });

  insertSample({
    streamId: "a-mock",
    channel: channelA,
    minute: 0,
    viewers: 99_999,
    messagesPerMinute: 99_999,
    source: "mock",
  });
  insertSample({
    streamId: "b-1",
    channel: channelB,
    minute: 0,
    viewers: 777,
    messagesPerMinute: 77,
  });
  viewers.forEach((value, index) => {
    insertSample({
      streamId: "legacy-1",
      minute: legacyStartMinute + index * 3,
      viewers: value,
      messagesPerMinute: chat[index],
      source: "mock",
    });
  });
  insertMarker({
    streamId: "legacy-1",
    minute: legacyStartMinute + 18,
    label: "Legacy marker",
    source: "mock",
  });
}

beforeEach(async () => {
  closeDatabase();
  temporaryDirectory = await mkdtemp(join(tmpdir(), "fenya-advanced-analytics-"));
  process.env.DATABASE_PATH = join(temporaryDirectory, "test.sqlite");
  process.env.TWITCH_PROVIDER = "mock";
  process.env.TWITCH_CHANNEL_LOGIN = "fenya";
  process.env.PLATFORM_ADMIN_TWITCH_IDS = "";
  process.env.PLATFORM_ADMIN_TWITCH_LOGINS = "";

  const owner = findOrCreateUserFromTwitchProfile(profile("advanced-owner", "advanced_owner"));
  const admin = findOrCreateUserFromTwitchProfile(profile("advanced-admin", "advanced_admin"));
  const moderator = findOrCreateUserFromTwitchProfile(profile("advanced-moderator", "advanced_moderator"));
  const chatter = findOrCreateUserFromTwitchProfile(profile("advanced-chatter", "advanced_chatter"));
  const outsider = findOrCreateUserFromTwitchProfile(profile("advanced-outsider", "advanced_outsider"));
  const otherOwner = findOrCreateUserFromTwitchProfile(profile("other-owner", "other_owner"));

  channelA = findOrCreateChannelFromBroadcaster(profile("channel-a", "fenya"), owner.id);
  channelB = findOrCreateChannelFromBroadcaster(profile("channel-b", "other_channel"), otherOwner.id);
  addOrUpdateChannelMembership(channelA.id, owner.id, "channel_owner");
  addOrUpdateChannelMembership(channelA.id, admin.id, "channel_admin");
  addOrUpdateChannelMembership(channelA.id, moderator.id, "moderator");
  addOrUpdateChannelMembership(channelA.id, chatter.id, "chatter");
  addOrUpdateChannelMembership(channelB.id, otherOwner.id, "channel_owner");

  cookies = {
    owner: sessionCookie(owner.id),
    admin: sessionCookie(admin.id),
    moderator: sessionCookie(moderator.id),
    chatter: sessionCookie(chatter.id),
    outsider: sessionCookie(outsider.id),
    otherOwner: sessionCookie(otherOwner.id),
  };

  seedAdvancedAnalyticsRows();
  app = createApp();
});

afterEach(async () => {
  closeDatabase();
  delete process.env.DATABASE_PATH;
  delete process.env.TWITCH_PROVIDER;
  delete process.env.TWITCH_CHANNEL_LOGIN;
  delete process.env.PLATFORM_ADMIN_TWITCH_IDS;
  delete process.env.PLATFORM_ADMIN_TWITCH_LOGINS;
  await rm(temporaryDirectory, { recursive: true, force: true });
});

describe("advanced analytics API", () => {
  test("legacy route returns the full normalized contract and compatible clip fields", async () => {
    const response = await request(app).get("/api/streams/legacy-1/advanced-analytics");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({
      streamId: "legacy-1",
      channelId: null,
      source: "mock",
      generatedAt: expect.any(String),
      dataQuality: expect.objectContaining({
        status: expect.stringMatching(/^(complete|partial|insufficient)$/),
        warnings: expect.any(Array),
        viewerSamples: 12,
        messages: 3,
        uniqueChatters: 3,
        markers: 1,
        historicalStreams: 1,
        hasAbsoluteTimestamps: true,
        collectedFrom: expect.any(String),
        collectedPeriodOnly: expect.any(Boolean),
      }),
      loyalty: expect.objectContaining({
        activeParticipants: 3,
        participants: expect.any(Array),
        topParticipants: expect.any(Array),
      }),
      clipSuggestions: expect.any(Array),
      eventImpact: expect.any(Array),
      retention: expect.objectContaining({
        curve: expect.any(Array),
        drops: expect.any(Array),
      }),
    }));
    expect(Number.isNaN(Date.parse(response.body.generatedAt))).toBe(false);
    expect(response.body.clipSuggestions.length).toBeGreaterThan(0);
    expect(response.body.clipSuggestions[0]).toEqual(expect.objectContaining({
      time: expect.any(String),
      label: expect.any(String),
      type: expect.any(String),
      viewers: expect.any(Number),
      messagesPerMinute: expect.any(Number),
      startTime: expect.any(String),
      peakTime: expect.any(String),
      endTime: expect.any(String),
      durationMinutes: expect.any(Number),
      signalDurationMinutes: expect.any(Number),
      viewerDirection: expect.stringMatching(/^(up|down|neutral)$/),
      score: expect.any(Number),
      confidence: expect.any(Number),
    }));
    expect(response.body.eventImpact.length).toBeGreaterThan(0);
    expect(response.body.eventImpact[0]).toEqual(expect.objectContaining({
      effectCensored: expect.any(Boolean),
    }));
    expect(response.body.eventImpact[0]).toHaveProperty("effectDurationMinutes");
    expect(response.body.eventImpact[0]).toHaveProperty("effectObservedMinutes");
  });

  test("does not expose an owned connected-channel stream through the public legacy alias", async () => {
    const response = await request(app).get("/api/streams/a-5/advanced-analytics");

    expect(response.status).toBe(404);
    expect(response.body).toEqual(expect.objectContaining({
      error: true,
      message: expect.stringMatching(/not found/i),
    }));
  });

  test.each(["owner", "admin", "moderator", "chatter"])(
    "allows passive channel analytics to the %s membership role",
    async (role) => {
      const response = await request(app)
        .get(`/api/channels/${channelA.id}/streams/a-5/advanced-analytics`)
        .set("Cookie", cookies[role]);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ streamId: "a-5", channelId: channelA.id });
    },
  );

  test("returns the stable 401 envelope to a guest", async () => {
    const response = await request(app)
      .get(`/api/channels/${channelA.id}/streams/a-5/advanced-analytics`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "unauthorized", message: "Authentication required" });
  });

  test("returns the stable 403 envelope to an authenticated non-member", async () => {
    const response = await request(app)
      .get(`/api/channels/${channelA.id}/streams/a-5/advanced-analytics`)
      .set("Cookie", cookies.outsider);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "forbidden", message: "Insufficient permissions" });
  });

  test("returns 404 rather than leaking a stream through the wrong channel", async () => {
    const response = await request(app)
      .get(`/api/channels/${channelB.id}/streams/a-5/advanced-analytics`)
      .set("Cookie", cookies.otherOwner);

    expect(response.status).toBe(404);
    expect(response.body).toEqual(expect.objectContaining({
      error: true,
      message: expect.stringMatching(/not found/i),
    }));
  });

  test("returns 404 for an unknown stream ID", async () => {
    const legacy = await request(app).get("/api/streams/unknown-stream/advanced-analytics");
    const channelScoped = await request(app)
      .get(`/api/channels/${channelA.id}/streams/unknown-stream/advanced-analytics`)
      .set("Cookie", cookies.owner);

    expect(legacy.status).toBe(404);
    expect(channelScoped.status).toBe(404);
    expect(legacy.body).toEqual(expect.objectContaining({ error: true }));
    expect(channelScoped.body).toEqual(expect.objectContaining({ error: true }));
  });

  test("keeps Twitch analytics isolated from mock and other-channel rows", async () => {
    const response = await request(app)
      .get(`/api/channels/${channelA.id}/streams/a-5/advanced-analytics`)
      .set("Cookie", cookies.chatter);

    expect(response.status).toBe(200);
    expect(response.body.source).toBe("twitch");
    expect(response.body.dataQuality).toMatchObject({
      viewerSamples: 12,
      messages: 3,
      uniqueChatters: 3,
      historicalStreams: 5,
    });
    expect(response.body.loyalty.participants.map((participant) => participant.login))
      .not.toContain("mock_only_user");
    expect(response.body.loyalty.participants.map((participant) => participant.login))
      .not.toContain("same_stream_mock_user");
    expect(response.body.loyalty.participants.map((participant) => participant.login))
      .not.toContain("unsourced_aggregate_user");
    expect(response.body.loyalty.participants.map((participant) => participant.login))
      .not.toContain("other_channel_user");
    expect(response.body.clipSuggestions.every((candidate) => candidate.peakViewers < 99_999)).toBe(true);

    const legacySummary = await generateLocalSummary("a-5");
    expect(legacySummary.suggestedClipMoments.every((candidate) => candidate.peakViewers < 99_999)).toBe(true);
    expect(legacySummary.notableMoments.map((moment) => moment.label))
      .not.toContain("Mock marker on Twitch stream");
  });
});
