import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  attachCurrentUser,
  requireChannelRole,
  requireSelfOrChannelRole,
  requireUser,
} from "./middleware/authMiddleware.js";
import { errorHandler } from "./middleware/errorHandlers.js";
import { findOrCreateChannelFromBroadcaster } from "./repositories/channelRepository.js";
import { addOrUpdateChannelMembership } from "./repositories/membershipRepository.js";
import { findOrCreateUserFromTwitchProfile } from "./repositories/userRepository.js";
import { SESSION_COOKIE_NAME, startSession } from "./services/sessionService.js";
import { closeDatabase } from "./storage/db.js";

let app;
let tempDirectory;
let owner;
let moderator;
let chatter;
let outsider;
let channel;
let cookies;

function profile(id, login) {
  return { id, login, display_name: login, profile_image_url: null };
}

function sessionCookie(userId) {
  return `${SESSION_COOKIE_NAME}=${startSession(userId).rawToken}`;
}

beforeEach(() => {
  tempDirectory = mkdtempSync(join(tmpdir(), "fenya-auth-"));
  process.env.DATABASE_PATH = join(tempDirectory, "test.sqlite");

  owner = findOrCreateUserFromTwitchProfile(profile("tw-owner", "owner"));
  moderator = findOrCreateUserFromTwitchProfile(profile("tw-moderator", "moderator"));
  chatter = findOrCreateUserFromTwitchProfile(profile("tw-chatter", "chatter"));
  outsider = findOrCreateUserFromTwitchProfile(profile("tw-outsider", "outsider"));
  channel = findOrCreateChannelFromBroadcaster(profile("tw-channel", "fenya"), owner.id);
  addOrUpdateChannelMembership(channel.id, owner.id, "channel_owner");
  addOrUpdateChannelMembership(channel.id, moderator.id, "moderator");
  addOrUpdateChannelMembership(channel.id, chatter.id, "chatter");
  cookies = {
    owner: sessionCookie(owner.id),
    moderator: sessionCookie(moderator.id),
    chatter: sessionCookie(chatter.id),
    outsider: sessionCookie(outsider.id),
  };

  app = express();
  app.use(attachCurrentUser);
  app.get("/protected", requireUser, (req, res) => res.json({ userId: req.user.id }));
  app.get("/users/me", requireUser, (req, res) => res.json({ userId: req.user.id, sessionId: req.session.id }));
  app.get(
    "/channels/:channelId/analytics",
    requireChannelRole(["channel_owner", "channel_admin"]),
    (req, res) => res.json({ role: req.channelRole }),
  );
  app.get(
    "/channels/:channelId/moderation",
    requireChannelRole(["channel_owner", "channel_admin", "moderator"]),
    (req, res) => res.json({ role: req.channelRole }),
  );
  app.get(
    "/channels/:channelId/chatters/:twitchUserId",
    requireSelfOrChannelRole({ roles: ["channel_owner", "channel_admin", "moderator"] }),
    (req, res) => res.json({ self: req.isSelf, role: req.channelRole ?? null }),
  );
  app.use(errorHandler);
});

afterEach(() => {
  closeDatabase();
  delete process.env.DATABASE_PATH;
  rmSync(tempDirectory, { recursive: true, force: true });
});

describe("centralized authentication and channel authorization", () => {
  test("guest cannot access a protected route", async () => {
    const response = await request(app).get("/protected");
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "unauthorized", message: "Authentication required" });
  });

  test("logged-in user can access their own user route", async () => {
    const response = await request(app).get("/users/me").set("Cookie", cookies.chatter);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ userId: chatter.id, sessionId: expect.any(String) });
  });

  test("channel owner can access channel analytics", async () => {
    const response = await request(app).get(`/channels/${channel.id}/analytics`).set("Cookie", cookies.owner);
    expect(response.status).toBe(200);
    expect(response.body.role).toBe("channel_owner");
  });

  test("random user cannot access channel analytics", async () => {
    const response = await request(app).get(`/channels/${channel.id}/analytics`).set("Cookie", cookies.outsider);
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "forbidden", message: "Insufficient permissions" });
  });

  test("moderator can access a moderator-allowed route", async () => {
    const response = await request(app).get(`/channels/${channel.id}/moderation`).set("Cookie", cookies.moderator);
    expect(response.status).toBe(200);
    expect(response.body.role).toBe("moderator");
  });

  test("self-or-role permits a chatter to view their own stats", async () => {
    const response = await request(app)
      .get(`/channels/${channel.id}/chatters/tw-chatter`)
      .set("Cookie", cookies.chatter);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ self: true, role: null });
  });

  test("self-or-role blocks another chatter's stats from a normal user", async () => {
    const response = await request(app)
      .get(`/channels/${channel.id}/chatters/tw-owner`)
      .set("Cookie", cookies.chatter);
    expect(response.status).toBe(403);
  });
});
