import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  findTwitchAccountById,
  findTwitchAccountWithEncryptedTokens,
  upsertTwitchAccount,
} from "./repositories/twitchAccountRepository.js";
import { findOrCreateUserFromTwitchProfile } from "./repositories/userRepository.js";
import { twitchHelixRequest } from "./services/twitchHelixClient.js";
import { decryptToken } from "./services/tokenCryptoService.js";
import {
  getValidUserAccessTokenForAccount,
  refreshTokensExpiringSoon,
  refreshTwitchAccountToken,
  shutdownTwitchTokenRefreshJob,
  stopTwitchTokenRefreshJob,
} from "./services/twitchTokenRefreshService.js";
import { closeDatabase } from "./storage/db.js";

let tempDirectory;
let account;

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createStoredAccount({ expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString() } = {}) {
  const profile = { id: "refresh-user-42", login: "fenya", display_name: "Fenya" };
  const user = findOrCreateUserFromTwitchProfile(profile);
  upsertTwitchAccount(user.id, profile, {
    accessToken: "old-access-secret",
    refreshToken: "old-refresh-secret",
    scopes: ["user:read:chat"],
    expiresAt,
  });
  return findTwitchAccountWithEncryptedTokens(user.id);
}

beforeEach(() => {
  tempDirectory = mkdtempSync(join(tmpdir(), "fenya-token-refresh-"));
  process.env.DATABASE_PATH = join(tempDirectory, "test.sqlite");
  process.env.TOKEN_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  process.env.TWITCH_CLIENT_ID = "test-client-id";
  process.env.TWITCH_CLIENT_SECRET = "test-client-secret";
  account = createStoredAccount();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  stopTwitchTokenRefreshJob();
  closeDatabase();
  for (const name of [
    "DATABASE_PATH", "TOKEN_ENCRYPTION_KEY", "TWITCH_CLIENT_ID", "TWITCH_CLIENT_SECRET",
    "TWITCH_TOKEN_REFRESH_ENABLED", "TWITCH_TOKEN_REFRESH_INTERVAL_MS",
  ]) delete process.env[name];
  rmSync(tempDirectory, { recursive: true, force: true });
});

describe("stored Twitch token refresh lifecycle", () => {
  test("a valid database-backed token is reused without a network request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await getValidUserAccessTokenForAccount(account.id)).toBe("old-access-secret");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("an account expiring within ten minutes refreshes", async () => {
    account = createStoredAccount({ expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString() });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      access_token: "new-access-secret",
      refresh_token: "new-refresh-secret",
      expires_in: 7200,
      scope: ["user:read:chat"],
    })));

    const token = await getValidUserAccessTokenForAccount(account.id);
    expect(token).toBe("new-access-secret");
    expect(await refreshTokensExpiringSoon()).toEqual({ checked: 0, refreshed: 0, failed: 0 });
  });

  test("a rotated refresh token replaces the previous encrypted value", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      access_token: "rotated-access-secret",
      refresh_token: "rotated-refresh-secret",
      expires_in: 3600,
      scope: ["user:read:chat", "moderator:read:chatters"],
    })));

    await refreshTwitchAccountToken(account.id);
    const stored = findTwitchAccountById(account.id);
    expect(decryptToken(stored.refresh_token_encrypted)).toBe("rotated-refresh-secret");
    expect(JSON.parse(stored.scopes_json)).toEqual(["user:read:chat", "moderator:read:chatters"]);
  });

  test("refreshed access and refresh tokens remain encrypted at rest", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      access_token: "encrypted-new-access",
      refresh_token: "encrypted-new-refresh",
      expires_in: 3600,
      scope: [],
    })));

    await refreshTwitchAccountToken(account.id);
    const stored = findTwitchAccountById(account.id);
    const serialized = JSON.stringify(stored);
    expect(serialized).not.toContain("encrypted-new-access");
    expect(serialized).not.toContain("encrypted-new-refresh");
    expect(decryptToken(stored.access_token_encrypted)).toBe("encrypted-new-access");
  });

  test("an account-aware Helix 401 refreshes and retries exactly once", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ message: "Unauthorized" }, 401))
      .mockResolvedValueOnce(jsonResponse({
        access_token: "retry-access-secret",
        refresh_token: "retry-refresh-secret",
        expires_in: 3600,
        scope: ["user:read:chat"],
      }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: "refresh-user-42" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const payload = await twitchHelixRequest("/users", { twitchAccountId: account.id });
    expect(payload.data[0].id).toBe("refresh-user-42");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer old-access-secret");
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe("Bearer retry-access-secret");
  });

  test("a second Helix 401 marks the account for reauthorization and stops retrying", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ message: "Unauthorized" }, 401))
      .mockResolvedValueOnce(jsonResponse({
        access_token: "retry-access-secret",
        refresh_token: "retry-refresh-secret",
        expires_in: 3600,
        scope: ["user:read:chat"],
      }))
      .mockResolvedValueOnce(jsonResponse({ message: "Unauthorized" }, 401));
    vi.stubGlobal("fetch", fetchMock);

    await expect(twitchHelixRequest("/users", { twitchAccountId: account.id })).rejects.toMatchObject({
      status: 401,
      message: "Twitch account requires reauthorization",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(findTwitchAccountById(account.id).needs_reauth).toBe(1);
  });

  test("concurrent refreshes for one account share one external refresh request", async () => {
    let resolveRefresh;
    const fetchMock = vi.fn(() => new Promise((resolve) => { resolveRefresh = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    const first = refreshTwitchAccountToken(account.id);
    const second = refreshTwitchAccountToken(account.id);
    expect(fetchMock).toHaveBeenCalledOnce();
    resolveRefresh(jsonResponse({
      access_token: "deduplicated-access",
      refresh_token: "deduplicated-refresh",
      expires_in: 3600,
      scope: ["user:read:chat"],
    }));
    await expect(Promise.all([first, second])).resolves.toEqual(["deduplicated-access", "deduplicated-access"]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  test("shutdown waits for an in-flight token refresh before returning", async () => {
    let resolveRefresh;
    vi.stubGlobal("fetch", vi.fn(() => new Promise((resolve) => { resolveRefresh = resolve; })));
    const refresh = refreshTwitchAccountToken(account.id);
    let shutdownFinished = false;
    const shutdown = shutdownTwitchTokenRefreshJob().then(() => { shutdownFinished = true; });

    await Promise.resolve();
    expect(shutdownFinished).toBe(false);
    resolveRefresh(jsonResponse({
      access_token: "shutdown-access",
      refresh_token: "shutdown-refresh",
      expires_in: 3600,
      scope: ["user:read:chat"],
    }));

    await expect(Promise.all([refresh, shutdown])).resolves.toEqual(["shutdown-access", undefined]);
    expect(shutdownFinished).toBe(true);
  });

  test("a failed refresh marks the account as needing reauthorization", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ message: "Invalid refresh token" }, 400)));

    await expect(refreshTwitchAccountToken(account.id)).rejects.toMatchObject({
      status: 401,
      message: "Twitch account requires reauthorization",
    });
    expect(findTwitchAccountById(account.id).needs_reauth).toBe(1);
  });

  test("an invalid refresh lifetime is rejected instead of being persisted", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      access_token: "invalid-lifetime-access",
      refresh_token: "invalid-lifetime-refresh",
      expires_in: "never",
      scope: ["user:read:chat"],
    })));

    await expect(refreshTwitchAccountToken(account.id)).rejects.toMatchObject({
      status: 401,
      message: "Twitch account requires reauthorization",
    });
    const stored = findTwitchAccountById(account.id);
    expect(stored.needs_reauth).toBe(1);
    expect(decryptToken(stored.access_token_encrypted)).toBe("old-access-secret");
  });

  test("refresh failures do not expose raw tokens in errors or logs", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("upstream unavailable")));

    let caughtError;
    try {
      await refreshTwitchAccountToken(account.id);
    } catch (error) {
      caughtError = error;
    }
    const observable = JSON.stringify({ name: caughtError.name, message: caughtError.message, logs: consoleSpy.mock.calls });
    expect(observable).not.toContain("old-access-secret");
    expect(observable).not.toContain("old-refresh-secret");
  });
});
