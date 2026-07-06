import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { findOrCreateChannelFromBroadcaster, getUserChannels } from "./repositories/channelRepository.js";
import { addOrUpdateChannelMembership, getUserChannelRole } from "./repositories/membershipRepository.js";
import { deleteSession } from "./repositories/sessionRepository.js";
import { findTwitchAccountWithEncryptedTokens, upsertTwitchAccount } from "./repositories/twitchAccountRepository.js";
import { findOrCreateUserFromTwitchProfile } from "./repositories/userRepository.js";
import { findSessionByRawToken, hashSessionToken, startSession } from "./services/sessionService.js";
import { decryptToken } from "./services/tokenCryptoService.js";
import { closeDatabase, getDatabase } from "./storage/db.js";

let tempDirectory;

beforeEach(() => {
  tempDirectory = mkdtempSync(join(tmpdir(), "fenya-security-"));
  process.env.DATABASE_PATH = join(tempDirectory, "test.sqlite");
  process.env.TOKEN_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
});

afterEach(() => {
  closeDatabase();
  delete process.env.DATABASE_PATH;
  delete process.env.TOKEN_ENCRYPTION_KEY;
  rmSync(tempDirectory, { recursive: true, force: true });
});

const twitchProfile = {
  id: "twitch-42",
  login: "fenya",
  display_name: "Fenya",
  profile_image_url: "https://images.test/fenya.png",
};

describe("multi-user database and security foundation", () => {
  test("central database initialization enables WAL, foreign keys, and busy timeout", () => {
    const database = getDatabase();
    expect(database.pragma("journal_mode", { simple: true })).toBe("wal");
    expect(database.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(database.pragma("busy_timeout", { simple: true })).toBe(5000);
  });

  test("creates a user and links only encrypted Twitch tokens", () => {
    const user = findOrCreateUserFromTwitchProfile(twitchProfile);
    const publicAccount = upsertTwitchAccount(user.id, twitchProfile, {
      accessToken: "access-secret",
      refreshToken: "refresh-secret",
      scopes: ["user:read:chat"],
      expiresAt: "2026-08-01T00:00:00.000Z",
    });

    expect(user).toMatchObject({ display_name: "Fenya", avatar_url: twitchProfile.profile_image_url });
    expect(publicAccount).not.toHaveProperty("access_token_encrypted");
    expect(publicAccount).not.toHaveProperty("refresh_token_encrypted");

    const stored = findTwitchAccountWithEncryptedTokens(user.id);
    expect(stored.access_token_encrypted).not.toContain("access-secret");
    expect(stored.refresh_token_encrypted).not.toContain("refresh-secret");
    expect(decryptToken(stored.access_token_encrypted)).toBe("access-secret");
    expect(decryptToken(stored.refresh_token_encrypted)).toBe("refresh-secret");
  });

  test("stores only a session hash, resolves an active session, and deletes it", () => {
    const user = findOrCreateUserFromTwitchProfile(twitchProfile);
    const { rawToken, session, cookieOptions } = startSession(user.id, { userAgent: "vitest", ipAddress: "127.0.0.1" });
    const stored = getDatabase().prepare("SELECT * FROM sessions WHERE id = ?").get(session.id);

    expect(stored.token_hash).toBe(hashSessionToken(rawToken));
    expect(JSON.stringify(stored)).not.toContain(rawToken);
    expect(cookieOptions).toMatchObject({ httpOnly: true, sameSite: "lax", secure: false, path: "/" });
    expect(findSessionByRawToken(rawToken)).toMatchObject({ id: session.id, user_id: user.id });
    expect(deleteSession(session.id)).toBe(true);
    expect(findSessionByRawToken(rawToken)).toBeNull();
  });

  test("rejects expired sessions", () => {
    const user = findOrCreateUserFromTwitchProfile(twitchProfile);
    const { rawToken } = startSession(user.id, {}, -1);
    expect(findSessionByRawToken(rawToken)).toBeNull();
  });

  test("creates a channel and assigns its owner membership", () => {
    const user = findOrCreateUserFromTwitchProfile(twitchProfile);
    const channel = findOrCreateChannelFromBroadcaster(twitchProfile, user.id);
    const membership = addOrUpdateChannelMembership(channel.id, user.id, "channel_owner");

    expect(channel).toMatchObject({ twitch_broadcaster_id: "twitch-42", owner_user_id: user.id, is_active: 1 });
    expect(membership.role).toBe("channel_owner");
    expect(getUserChannelRole(channel.id, user.id)).toBe("channel_owner");
    expect(getUserChannels(user.id)).toEqual([expect.objectContaining({ id: channel.id, role: "channel_owner" })]);
  });
});
