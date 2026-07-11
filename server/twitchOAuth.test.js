import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

import request from "supertest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { createApp } from "./app.js";
import { findOrCreateChannelFromBroadcaster, setChannelIngestTwitchAccount } from "./repositories/channelRepository.js";
import { findTwitchAccountWithEncryptedTokens, upsertTwitchAccount } from "./repositories/twitchAccountRepository.js";
import { findOrCreateUserFromTwitchProfile } from "./repositories/userRepository.js";
import { decryptToken } from "./services/tokenCryptoService.js";
import { resetTwitchOAuthStateStore } from "./services/twitchOAuthService.js";
import { closeDatabase, getDatabase } from "./storage/db.js";

let app;
let tempDirectory;

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockOAuthNetwork(profileOverrides = {}) {
  const profile = {
    id: "oauth-user-42",
    login: "fenya_login",
    display_name: "Fenya Login",
    profile_image_url: "https://images.test/oauth-user.png",
    ...profileOverrides,
  };
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(jsonResponse({
      access_token: "oauth-access-secret",
      refresh_token: "oauth-refresh-secret",
      expires_in: 3600,
      scope: ["user:read:chat"],
      token_type: "bearer",
    }))
    .mockResolvedValueOnce(jsonResponse({
      client_id: "test-client-id",
      login: profile.login,
      scopes: ["user:read:chat"],
      user_id: profile.id,
      expires_in: 3600,
    }))
    .mockResolvedValueOnce(jsonResponse({ data: [profile] }));
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, profile };
}

async function completeLogin(agent, profileOverrides = {}) {
  const login = await agent.get("/auth/twitch/login");
  const authorizationUrl = new URL(login.headers.location);
  mockOAuthNetwork(profileOverrides);
  const callback = await agent.get(`/auth/twitch/callback?code=test-code&state=${authorizationUrl.searchParams.get("state")}`);
  return { login, callback };
}

async function completeIngestLogin(agent, profileOverrides = {}, callbackQuery = "") {
  const login = await agent.get("/auth/twitch/login?purpose=ingest&channel=fenya&reauth=1");
  const authorizationUrl = new URL(login.headers.location);
  mockOAuthNetwork(profileOverrides);
  const callback = await agent.get(`/auth/twitch/callback?code=test-code&state=${authorizationUrl.searchParams.get("state")}${callbackQuery}`);
  return { login, callback };
}

beforeEach(() => {
  tempDirectory = mkdtempSync(join(tmpdir(), "fenya-oauth-"));
  process.env.DATABASE_PATH = join(tempDirectory, "test.sqlite");
  process.env.TOKEN_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  process.env.TWITCH_CLIENT_ID = "test-client-id";
  process.env.TWITCH_CLIENT_SECRET = "test-client-secret";
  process.env.TWITCH_REDIRECT_URI = "http://localhost:3001/auth/twitch/callback";
  process.env.AUTH_SUCCESS_REDIRECT_URI = "http://localhost:5173/";
  resetTwitchOAuthStateStore();
  app = createApp();
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetTwitchOAuthStateStore();
  closeDatabase();
  for (const name of [
    "DATABASE_PATH", "TOKEN_ENCRYPTION_KEY", "TWITCH_CLIENT_ID", "TWITCH_CLIENT_SECRET",
    "TWITCH_REDIRECT_URI", "TWITCH_OAUTH_SCOPES", "AUTH_SUCCESS_REDIRECT_URI", "APP_BASE_URL", "NODE_ENV",
    "PLATFORM_ADMIN_TWITCH_IDS", "PLATFORM_ADMIN_TWITCH_LOGINS", "TWITCH_CHAT_READER_USER_ID", "TWITCH_CHAT_READER_LOGIN",
  ]) delete process.env[name];
  rmSync(tempDirectory, { recursive: true, force: true });
});

describe("Twitch Authorization Code login", () => {
  test("generates a Twitch login URL with the required chat scope and state", async () => {
    const response = await request(app).get("/auth/twitch/login");
    const url = new URL(response.headers.location);

    expect(response.status).toBe(302);
    expect(url.origin + url.pathname).toBe("https://id.twitch.tv/oauth2/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("test-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(process.env.TWITCH_REDIRECT_URI);
    expect(url.searchParams.get("scope")?.split(" ")).toContain("user:read:chat");
    expect(url.searchParams.get("state")).toEqual(expect.any(String));
    const cookies = response.headers["set-cookie"].join(";");
    expect(cookies).toContain("fenya_oauth_attempts=");
    expect(cookies).toContain("HttpOnly");
    expect(cookies).toContain("SameSite=Lax");
    expect(cookies).not.toContain("test-client-secret");
  });

  test("OAuth state cookie is secure only in production", async () => {
    const development = await request(app).get("/auth/twitch/login");
    expect(development.headers["set-cookie"].join(";")).not.toContain("Secure");

    process.env.NODE_ENV = "production";
    const production = await request(app).get("/auth/twitch/login");
    expect(production.headers["set-cookie"].join(";")).toContain("Secure");
  });

  test("keeps configured OAuth scopes alongside the required chat scope", async () => {
    process.env.TWITCH_OAUTH_SCOPES = "user:read:email user:read:chat";
    const response = await request(app).get("/auth/twitch/login");
    const scopes = new URL(response.headers.location).searchParams.get("scope").split(" ");
    expect(scopes).toEqual(expect.arrayContaining(["user:read:email", "user:read:chat"]));
    expect(scopes.filter((scope) => scope === "user:read:chat")).toHaveLength(1);
  });

  test("reauth login forces Twitch to show authorization again", async () => {
    const response = await request(app).get("/auth/twitch/login?reauth=1");
    expect(new URL(response.headers.location).searchParams.get("force_verify")).toBe("true");
  });

  test("moderator reauth can request only the allowed optional scope", async () => {
    const response = await request(app).get("/auth/twitch/login?reauth=1&scope=moderation:read,channel:manage:broadcast");
    const scopes = new URL(response.headers.location).searchParams.get("scope").split(" ");
    expect(scopes).toContain("moderation:read");
    expect(scopes).toContain("user:read:chat");
    expect(scopes).not.toContain("channel:manage:broadcast");
  });

  test("invalid or expired state returns a friendly retry page", async () => {
    const response = await request(app).get("/auth/twitch/callback?code=test-code&state=expired-state");
    expect(response.status).toBe(400);
    expect(response.type).toBe("text/html");
    expect(response.text).toContain("Сессия авторизации Twitch истекла. Повторите подключение.");
    expect(response.text).toContain("Повторить подключение Twitch");
    expect(response.text).not.toContain("test-client-secret");
  });

  test("multiple pending browser attempts remain independently valid", async () => {
    const agent = request.agent(app);
    const firstLogin = await agent.get("/auth/twitch/login");
    const secondLogin = await agent.get("/auth/twitch/login?reauth=1&scope=moderation:read");
    const firstState = new URL(firstLogin.headers.location).searchParams.get("state");
    const secondState = new URL(secondLogin.headers.location).searchParams.get("state");
    expect(firstState).not.toBe(secondState);
    mockOAuthNetwork();
    const callback = await agent.get(`/auth/twitch/callback?code=test-code&state=${firstState}`);
    expect(callback.status).toBe(302);
  });

  test("local login uses the documented callback when the redirect env is absent", async () => {
    delete process.env.TWITCH_REDIRECT_URI;
    const response = await request(app).get("/auth/twitch/login");
    const url = new URL(response.headers.location);
    expect(response.status).toBe(302);
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3001/auth/twitch/callback");
  });

  test("missing production redirect returns a friendly HTML or inline JSON error", async () => {
    delete process.env.TWITCH_REDIRECT_URI;
    process.env.NODE_ENV = "production";

    const browserResponse = await request(app).get("/auth/twitch/login");
    expect(browserResponse.status).toBe(503);
    expect(browserResponse.type).toBe("text/html");
    expect(browserResponse.text).toContain("Twitch OAuth is not configured. Missing TWITCH_REDIRECT_URI.");

    const panelResponse = await request(app).get("/auth/twitch/login?format=json");
    expect(panelResponse.status).toBe(503);
    expect(panelResponse.body).toEqual({
      error: true,
      message: "Twitch OAuth is not configured. Missing TWITCH_REDIRECT_URI.",
    });
  });

  test("callback creates or updates the local user and channel owner membership", async () => {
    findOrCreateUserFromTwitchProfile({ id: "oauth-user-42", login: "old_login", display_name: "Old Name" });
    const agent = request.agent(app);
    const { callback } = await completeLogin(agent);
    const database = getDatabase();

    expect(callback.status).toBe(302);
    expect(callback.headers.location).toBe("http://localhost:5173/");
    expect(database.prepare("SELECT COUNT(*) AS count FROM users").get().count).toBe(1);
    expect(database.prepare("SELECT display_name FROM users").get().display_name).toBe("Fenya Login");
    expect(database.prepare("SELECT role FROM channel_memberships").get().role).toBe("channel_owner");
  });

  test("ingest OAuth securely links a reader to the existing ownerless channel without creating the reader channel", async () => {
    const database = getDatabase();
    const fenya = findOrCreateChannelFromBroadcaster({ id: "monitored-100", login: "fenya", display_name: "Fenya" });
    process.env.TWITCH_CHAT_READER_USER_ID = "reader-200";

    const { login, callback } = await completeIngestLogin(request.agent(app), {
      id: "reader-200", login: "reader_login", display_name: "Reader Login",
    }, "&purpose=owner&channel=reader_login");

    expect(login.status).toBe(302);
    expect(new URL(login.headers.location).searchParams.get("force_verify")).toBe("true");
    expect(callback.status).toBe(302);
    const linkedChannel = database.prepare("SELECT * FROM channels WHERE id = ?").get(fenya.id);
    const account = database.prepare("SELECT * FROM twitch_accounts WHERE id = ?").get(linkedChannel.ingest_twitch_account_id);
    expect(linkedChannel.owner_user_id).toBeNull();
    expect(account).toMatchObject({ twitch_user_id: "reader-200", twitch_login: "reader_login" });
    expect(database.prepare("SELECT COUNT(*) AS count FROM channels").get().count).toBe(1);
    expect(database.prepare("SELECT COUNT(*) AS count FROM channel_memberships").get().count).toBe(0);
    expect(database.prepare("SELECT COUNT(*) AS count FROM sessions").get().count).toBe(1);
  });

  test("ingest OAuth accepts the normalized configured reader login", async () => {
    findOrCreateChannelFromBroadcaster({ id: "monitored-101", login: "fenya", display_name: "Fenya" });
    process.env.TWITCH_CHAT_READER_LOGIN = "  Reader_Login  ";

    const { callback } = await completeIngestLogin(request.agent(app), {
      id: "reader-201", login: "reader_login", display_name: "Reader Login",
    });

    expect(callback.status).toBe(302);
    expect(getDatabase().prepare("SELECT ingest_twitch_account_id FROM channels WHERE twitch_login = 'fenya'").get().ingest_twitch_account_id).not.toBeNull();
  });

  test.each([
    ["TWITCH_CHAT_READER_USER_ID", "expected-reader", { id: "wrong-reader", login: "reader_login" }],
    ["TWITCH_CHAT_READER_LOGIN", "expected_login", { id: "reader-202", login: "wrong_login" }],
  ])("ingest OAuth rejects a profile that does not match %s before linking", async (envName, expected, profile) => {
    findOrCreateChannelFromBroadcaster({ id: `monitored-${envName}`, login: "fenya", display_name: "Fenya" });
    process.env[envName] = expected;

    const { callback } = await completeIngestLogin(request.agent(app), profile);

    expect(callback.status).toBe(403);
    expect(callback.text).toContain("\u0410\u0432\u0442\u043e\u0440\u0438\u0437\u043e\u0432\u0430\u043d \u0434\u0440\u0443\u0433\u043e\u0439 Twitch-\u0430\u043a\u043a\u0430\u0443\u043d\u0442");
    expect(callback.text).toContain("purpose=ingest&amp;channel=fenya&amp;reauth=1");
    expect(getDatabase().prepare("SELECT ingest_twitch_account_id FROM channels WHERE twitch_login = 'fenya'").get().ingest_twitch_account_id).toBeNull();
    expect(getDatabase().prepare("SELECT COUNT(*) AS count FROM twitch_accounts").get().count).toBe(0);
  });

  test("a mismatched OAuth profile cannot replace an existing linked reader account", async () => {
    const channel = findOrCreateChannelFromBroadcaster({ id: "monitored-existing", login: "fenya", display_name: "Fenya" });
    const existingProfile = { id: "existing-reader", login: "existing_reader", display_name: "Existing Reader" };
    const existingUser = findOrCreateUserFromTwitchProfile(existingProfile);
    const existingAccount = upsertTwitchAccount(existingUser.id, existingProfile, {
      accessToken: "existing-access",
      refreshToken: "existing-refresh",
      scopes: ["user:read:chat"],
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    setChannelIngestTwitchAccount(channel.id, existingAccount.id);
    process.env.TWITCH_CHAT_READER_USER_ID = "existing-reader";

    const { callback } = await completeIngestLogin(request.agent(app), {
      id: "unrelated-reader", login: "unrelated_reader", display_name: "Unrelated Reader",
    });

    expect(callback.status).toBe(403);
    expect(getDatabase().prepare("SELECT ingest_twitch_account_id FROM channels WHERE id = ?").get(channel.id).ingest_twitch_account_id).toBe(existingAccount.id);
    expect(getDatabase().prepare("SELECT COUNT(*) AS count FROM twitch_accounts").get().count).toBe(1);
  });

  test("callback uses APP_BASE_URL as the production same-origin destination", async () => {
    process.env.APP_BASE_URL = "https://stats.example.com";

    const { callback } = await completeLogin(request.agent(app));

    expect(callback.status).toBe(302);
    expect(callback.headers.location).toBe("https://stats.example.com/");
  });

  test("callback stores Twitch tokens only as encrypted values", async () => {
    await completeLogin(request.agent(app));
    const user = getDatabase().prepare("SELECT id FROM users").get();
    const account = findTwitchAccountWithEncryptedTokens(user.id);
    const serialized = JSON.stringify(account);

    expect(serialized).not.toContain("oauth-access-secret");
    expect(serialized).not.toContain("oauth-refresh-secret");
    expect(decryptToken(account.access_token_encrypted)).toBe("oauth-access-secret");
    expect(decryptToken(account.refresh_token_encrypted)).toBe("oauth-refresh-secret");
  });

  test("callback stores the validated Twitch scopes", async () => {
    const agent = request.agent(app);
    await completeLogin(agent);
    const account = getDatabase().prepare("SELECT scopes_json FROM twitch_accounts").get();
    expect(JSON.parse(account.scopes_json)).toContain("user:read:chat");
    const channels = await agent.get("/api/channels/mine");
    expect(channels.body.channels[0]).toMatchObject({ needsReauth: false, missingScopes: [] });
  });

  test("callback sets the persistent HTTP-only session cookie", async () => {
    const { callback } = await completeLogin(request.agent(app));
    const cookies = callback.headers["set-cookie"].join(";");

    expect(cookies).toContain("fenya_session=");
    expect(cookies).toContain("HttpOnly");
    expect(cookies).toContain("SameSite=Lax");
    expect(cookies).toContain("Expires=");
    expect(cookies).not.toContain("oauth-access-secret");
  });

  test("api/me returns safe current-user, channel, and membership data", async () => {
    const agent = request.agent(app);
    await completeLogin(agent);
    const response = await agent.get("/api/me");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      isLoggedIn: true,
      user: { displayName: "Fenya Login" },
      twitchAccount: { login: "fenya_login" },
      ownedChannels: [{ twitchLogin: "fenya_login", role: "channel_owner" }],
      memberships: [{ role: "channel_owner" }],
      globalRoles: [],
      roleSummary: {
        isChannelOwner: true,
        isChannelAdmin: false,
        isModerator: false,
        isChatter: true,
        isPlatformAdmin: false,
      },
      role: "channel_owner",
      permissions: { canControlIngest: true, readOnly: false },
    });
  });

  test("api/me exposes a local platform-admin role for an allowlisted login", async () => {
    process.env.PLATFORM_ADMIN_TWITCH_LOGINS = "other_login,WWQUIX";
    const agent = request.agent(app);
    await completeLogin(agent, { id: "admin-user-1", login: "wwquix", display_name: "WWQuix" });
    const response = await agent.get("/api/me");

    expect(response.body.roleSummary.isPlatformAdmin).toBe(true);
    expect(response.body.globalRoles).toEqual(["platform_admin"]);
    expect(JSON.stringify(response.body).toLowerCase()).not.toContain("access_token");
  });

  test("api/me never returns token or session fields", async () => {
    const agent = request.agent(app);
    await completeLogin(agent);
    const response = await agent.get("/api/me");
    const serialized = JSON.stringify(response.body).toLowerCase();

    for (const forbidden of ["access_token", "refresh_token", "encrypted", "session", "token_hash", "oauth-access-secret"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  test("api/me derives moderator badge state from the synced moderator directory", async () => {
    const agent = request.agent(app);
    await completeLogin(agent);
    const database = getDatabase();
    const channel = database.prepare("SELECT id FROM channels").get();
    database.prepare(`
      INSERT INTO channel_moderators (channel_id, twitch_user_id, login, display_name, synced_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(channel.id, "oauth-user-42", "fenya_login", "Fenya Login", new Date().toISOString());

    const response = await agent.get("/api/me");
    expect(response.body.roleSummary.isModerator).toBe(true);
  });

  test("logout deletes the database session and clears authentication", async () => {
    const agent = request.agent(app);
    await completeLogin(agent);
    expect(getDatabase().prepare("SELECT COUNT(*) AS count FROM sessions").get().count).toBe(1);

    const logout = await agent.post("/auth/logout");
    expect(logout.status).toBe(204);
    expect(getDatabase().prepare("SELECT COUNT(*) AS count FROM sessions").get().count).toBe(0);
    const guest = await agent.get("/api/me");
    expect(guest.status).toBe(200);
    expect(guest.body).toMatchObject({ isLoggedIn: false, roleSummary: { isGuest: true } });
  });
});
