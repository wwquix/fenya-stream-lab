import { mkdtempSync, rmSync } from "node:fs";
import { Buffer } from "node:buffer";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import Database from "better-sqlite3";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { findOrCreateChannelFromBroadcaster, getUserChannels } from "./repositories/channelRepository.js";
import { addOrUpdateChannelMembership, getUserChannelRole } from "./repositories/membershipRepository.js";
import { deleteSession } from "./repositories/sessionRepository.js";
import { findTwitchAccountWithEncryptedTokens, upsertTwitchAccount } from "./repositories/twitchAccountRepository.js";
import { findOrCreateUserFromTwitchProfile } from "./repositories/userRepository.js";
import { findSessionByRawToken, hashSessionToken, startSession } from "./services/sessionService.js";
import { decryptToken, encryptToken, TokenCryptoConfigError } from "./services/tokenCryptoService.js";
import { applySafeMigrations, closeDatabase, getDatabase } from "./storage/db.js";

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

  test("upgrades an existing database with the nullable ingest account link without losing data", () => {
    const legacyDatabase = new Database(process.env.DATABASE_PATH);
    legacyDatabase.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY, display_name TEXT NOT NULL, avatar_url TEXT, created_at TEXT, last_login_at TEXT);
      CREATE TABLE twitch_accounts (
        id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, twitch_user_id TEXT NOT NULL UNIQUE,
        twitch_login TEXT NOT NULL, twitch_display_name TEXT NOT NULL, profile_image_url TEXT,
        access_token_encrypted TEXT, refresh_token_encrypted TEXT, scopes_json TEXT NOT NULL DEFAULT '[]',
        expires_at TEXT, needs_reauth INTEGER NOT NULL DEFAULT 0, created_at TEXT, updated_at TEXT,
        UNIQUE (user_id)
      );
      CREATE TABLE channels (
        id INTEGER PRIMARY KEY, twitch_broadcaster_id TEXT NOT NULL UNIQUE, twitch_login TEXT NOT NULL,
        display_name TEXT NOT NULL, profile_image_url TEXT, owner_user_id INTEGER,
        is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT, updated_at TEXT
      );
      CREATE TABLE streams (stream_id TEXT PRIMARY KEY, channel_login TEXT NOT NULL, title TEXT NOT NULL);
      CREATE TABLE viewer_samples (id INTEGER PRIMARY KEY, event_id TEXT UNIQUE, stream_id TEXT NOT NULL, time_label TEXT NOT NULL, viewers INTEGER NOT NULL);
      CREATE TABLE chat_messages (id INTEGER PRIMARY KEY, event_id TEXT UNIQUE, stream_id TEXT NOT NULL, time_label TEXT NOT NULL, chatter_login TEXT NOT NULL, message_text TEXT NOT NULL);
      INSERT INTO users VALUES (1, 'Reader', NULL, '2026-01-01', NULL);
      INSERT INTO twitch_accounts VALUES (2, 1, 'reader-id', 'reader', 'Reader', NULL, 'encrypted-a', 'encrypted-r', '["user:read:chat"]', '2027-01-01', 0, '2026-01-01', '2026-01-01');
      INSERT INTO channels VALUES (3, 'broadcaster-id', 'fenya', 'Fenya', NULL, NULL, 1, '2026-01-01', '2026-01-01');
      INSERT INTO streams VALUES ('stream-1', 'fenya', 'Existing stream');
      INSERT INTO viewer_samples VALUES (4, 'sample-1', 'stream-1', '00:01', 10);
      INSERT INTO chat_messages VALUES (5, 'message-1', 'stream-1', '00:01', 'viewer', 'Existing message');
    `);
    legacyDatabase.close();

    const database = getDatabase();
    applySafeMigrations(database);
    applySafeMigrations(database);

    expect(database.prepare("PRAGMA table_info(channels)").all().map((column) => column.name)).toContain("ingest_twitch_account_id");
    expect(database.prepare("SELECT COUNT(*) AS count FROM users").get().count).toBe(1);
    expect(database.prepare("SELECT COUNT(*) AS count FROM twitch_accounts").get().count).toBe(1);
    expect(database.prepare("SELECT COUNT(*) AS count FROM streams").get().count).toBe(1);
    expect(database.prepare("SELECT COUNT(*) AS count FROM viewer_samples").get().count).toBe(1);
    expect(database.prepare("SELECT COUNT(*) AS count FROM chat_messages").get().count).toBe(1);
    expect(database.prepare("SELECT * FROM channels WHERE id = 3").get()).toMatchObject({
      twitch_broadcaster_id: "broadcaster-id",
      owner_user_id: null,
      ingest_twitch_account_id: null,
    });
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

  test("token encryption rejects malformed base64 keys at runtime", () => {
    process.env.TOKEN_ENCRYPTION_KEY = `${Buffer.alloc(32, 3).toString("base64")}!`;

    expect(() => encryptToken("access-secret")).toThrow(TokenCryptoConfigError);
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
