import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

import request from "supertest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { createApp } from "./app.js";
import { findOrCreateChannelFromBroadcaster, setChannelIngestTwitchAccount } from "./repositories/channelRepository.js";
import { addOrUpdateChannelMembership } from "./repositories/membershipRepository.js";
import { upsertTwitchAccount } from "./repositories/twitchAccountRepository.js";
import { findOrCreateUserFromTwitchProfile } from "./repositories/userRepository.js";
import { resetTwitchAuthCache } from "./services/twitchAuthService.js";
import {
  getAllIngestStatuses,
  getChannelIngestStatus,
  getTwitchIngestPoolDebugStateForTests,
  resetTwitchIngestPoolForTests,
  setTwitchEventSubTimingForTests,
  setTwitchIngestPoolWebSocketFactoryForTests,
  shutdownAllIngest,
  startChannelIngest,
  stopChannelIngest,
} from "./services/twitchIngestPoolService.js";
import { SESSION_COOKIE_NAME, startSession } from "./services/sessionService.js";
import { closeDatabase, getDatabase } from "./storage/db.js";

class FakeWebSocket extends EventEmitter {
  constructor(url = null) {
    super();
    this.url = url;
    this.readyState = 1;
    this.closeCalls = 0;
    this.terminateCalls = 0;
    this.deferClose = false;
    this.onClose = null;
  }
  close() {
    this.closeCalls += 1;
    this.onClose?.();
    if (!this.deferClose) {
      this.readyState = 3;
      this.emit("close", 1000);
    }
  }
  terminate() {
    this.terminateCalls += 1;
    this.readyState = 3;
    this.emit("close", 1006);
  }
}

let tempDirectory;
let app;
let channelA;
let channelB;
let outsiderCookie;
let ownerCookie;
let chatterCookie;
let moderatorCookie;
let platformAdminCookie;
let sockets;
let socketInstances;
let twitchFetchMock;

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

function emitEventSub(socket, messageType, payload = {}, metadata = {}) {
  socket.emit("message", JSON.stringify({
    metadata: { message_type: messageType, ...metadata },
    payload,
  }));
}

function emitWelcome(socket, sessionId, overrides = {}) {
  emitEventSub(socket, "session_welcome", {
    session: {
      id: sessionId,
      connected_at: "2026-07-04T18:05:00Z",
      keepalive_timeout_seconds: 30,
      ...overrides,
    },
  });
}

function eventSubSubscriptionCalls() {
  return twitchFetchMock.mock.calls.filter(([url]) => String(url).includes("/helix/eventsub/subscriptions"));
}

async function flushAsyncWork() {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

function createChannel(suffix) {
  const profile = {
    id: `broadcaster-${suffix}`,
    login: `channel-${suffix.toLowerCase()}`,
    display_name: `Channel ${suffix}`,
  };
  const owner = findOrCreateUserFromTwitchProfile(profile);
  const account = upsertTwitchAccount(owner.id, profile, {
    accessToken: `access-${suffix}`,
    refreshToken: `refresh-${suffix}`,
    scopes: ["user:read:chat"],
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });
  const channel = findOrCreateChannelFromBroadcaster(profile, owner.id);
  setChannelIngestTwitchAccount(channel.id, account.id);
  addOrUpdateChannelMembership(channel.id, owner.id, "channel_owner");
  return { ...channel, owner };
}

function installTwitchMocks() {
  const fetchMock = vi.fn(async (url, options = {}) => {
    const target = String(url);
    if (target.includes("/oauth2/validate")) {
      const token = options.headers.Authorization.replace("OAuth access-", "");
      return jsonResponse({ user_id: `broadcaster-${token}`, login: `channel-${token.toLowerCase()}`, scopes: ["user:read:chat"], expires_in: 3600 });
    }
    if (target.includes("/oauth2/token")) return jsonResponse({ access_token: "app-token", expires_in: 3600 });
    if (target.includes("/helix/users?login=")) {
      const login = decodeURIComponent(target.split("login=")[1]);
      const suffix = login.endsWith("a") ? "A" : "B";
      return jsonResponse({ data: [{ id: `broadcaster-${suffix}`, login, display_name: `Channel ${suffix}` }] });
    }
    if (target.includes("/helix/channels")) return jsonResponse({ data: [{ title: "Channel title", game_name: "CS2" }] });
    if (target.includes("/helix/streams")) {
      const suffix = target.includes("broadcaster-A") ? "A" : "B";
      return jsonResponse({ data: [{ id: `stream-${suffix}`, title: `Live ${suffix}`, game_name: "CS2", viewer_count: 100, started_at: "2026-07-04T18:00:00Z" }] });
    }
    if (target.includes("/helix/eventsub/subscriptions")) {
      const body = JSON.parse(options.body);
      return jsonResponse({ data: [{ id: `subscription-${body.condition.broadcaster_user_id}` }] }, 202);
    }
    throw new Error(`Unexpected Twitch test request: ${target}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  tempDirectory = mkdtempSync(join(tmpdir(), "fenya-ingest-pool-"));
  process.env.DATABASE_PATH = join(tempDirectory, "test.sqlite");
  process.env.TOKEN_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  process.env.TWITCH_PROVIDER = "twitch";
  process.env.TWITCH_CLIENT_ID = "client-id";
  process.env.TWITCH_CLIENT_SECRET = "client-secret";
  resetTwitchAuthCache();
  resetTwitchIngestPoolForTests();
  channelA = createChannel("A");
  channelB = createChannel("B");
  ownerCookie = `${SESSION_COOKIE_NAME}=${startSession(channelA.owner.id).rawToken}`;
  const chatter = findOrCreateUserFromTwitchProfile({ id: "chatter", login: "chatter", display_name: "Chatter" });
  addOrUpdateChannelMembership(channelA.id, chatter.id, "chatter");
  chatterCookie = `${SESSION_COOKIE_NAME}=${startSession(chatter.id).rawToken}`;
  const moderator = findOrCreateUserFromTwitchProfile({ id: "moderator", login: "moderator", display_name: "Moderator" });
  addOrUpdateChannelMembership(channelA.id, moderator.id, "moderator");
  moderatorCookie = `${SESSION_COOKIE_NAME}=${startSession(moderator.id).rawToken}`;
  const platformAdmin = findOrCreateUserFromTwitchProfile({ id: "platform-admin", login: "wwquix", display_name: "Platform Admin" });
  platformAdminCookie = `${SESSION_COOKIE_NAME}=${startSession(platformAdmin.id).rawToken}`;
  process.env.PLATFORM_ADMIN_TWITCH_LOGINS = "wwquix";
  const outsider = findOrCreateUserFromTwitchProfile({ id: "outsider", login: "outsider", display_name: "Outsider" });
  outsiderCookie = `${SESSION_COOKIE_NAME}=${startSession(outsider.id).rawToken}`;
  sockets = new Map();
  socketInstances = [];
  setTwitchIngestPoolWebSocketFactoryForTests((_url, channelId) => {
    const socket = new FakeWebSocket(_url);
    socketInstances.push(socket);
    sockets.set(String(channelId), socket);
    queueMicrotask(() => socket.emit("message", JSON.stringify({
      metadata: { message_type: "session_welcome" },
      payload: { session: { id: `session-${channelId}`, connected_at: "2026-07-04T18:05:00Z", keepalive_timeout_seconds: 30 } },
    })));
    return socket;
  });
  twitchFetchMock = installTwitchMocks();
  app = createApp();
});

afterEach(() => {
  resetTwitchIngestPoolForTests();
  vi.useRealTimers();
  resetTwitchAuthCache();
  vi.unstubAllGlobals();
  closeDatabase();
  for (const name of ["DATABASE_PATH", "TOKEN_ENCRYPTION_KEY", "TWITCH_PROVIDER", "TWITCH_CLIENT_ID", "TWITCH_CLIENT_SECRET", "PLATFORM_ADMIN_TWITCH_LOGINS", "TWITCH_CHANNEL_LOGIN", "NODE_ENV"]) {
    delete process.env[name];
  }
  rmSync(tempDirectory, { recursive: true, force: true });
});

describe("multi-channel Twitch ingest pool", () => {
  test("an ownerless monitored channel uses a different linked reader identity and token for EventSub", async () => {
    const readerProfile = { id: "broadcaster-reader", login: "reader-login", display_name: "Reader" };
    const reader = findOrCreateUserFromTwitchProfile(readerProfile);
    const readerAccount = upsertTwitchAccount(reader.id, readerProfile, {
      accessToken: "access-reader",
      refreshToken: "refresh-reader",
      scopes: ["user:read:chat"],
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
    const monitored = findOrCreateChannelFromBroadcaster({
      id: "monitored-broadcaster",
      login: "fenya-ownerless",
      display_name: "Fenya",
    });
    setChannelIngestTwitchAccount(monitored.id, readerAccount.id);

    const status = await startChannelIngest(monitored.id);
    const subscriptionCall = twitchFetchMock.mock.calls.find(([url]) => String(url).includes("/helix/eventsub/subscriptions"));
    const subscriptionBody = JSON.parse(subscriptionCall[1].body);

    expect(status).toMatchObject({
      broadcasterId: "monitored-broadcaster",
      chatReaderUserId: "broadcaster-reader",
      running: true,
    });
    expect(subscriptionBody.condition).toEqual({
      broadcaster_user_id: "monitored-broadcaster",
      user_id: "broadcaster-reader",
    });
    expect(subscriptionCall[1].headers.Authorization).toBe("Bearer access-reader");
    expect(getDatabase().prepare("SELECT owner_user_id FROM channels WHERE id = ?").get(monitored.id).owner_user_id).toBeNull();

    process.env.NODE_ENV = "production";
    process.env.TWITCH_CHANNEL_LOGIN = monitored.twitch_login;
    const diagnostics = await request(app).get("/api/twitch/fenya/connection");
    expect(diagnostics.body).toMatchObject({
      channelFound: true,
      channelHasOwner: false,
      ingestAccountFound: true,
      oauthAccountFound: true,
      readerLogin: "reader-login",
      readerUserId: "broadcaster-reader",
      needsReauth: false,
      tokenSource: "database_oauth",
    });
    expect(diagnostics.text).not.toContain("access-reader");
    expect(diagnostics.text).not.toContain("refresh-reader");
  });

  test("starting channel A creates one pool entry", async () => {
    await startChannelIngest(channelA.id);
    expect(getAllIngestStatuses()).toHaveLength(1);
    expect(getChannelIngestStatus(channelA.id)).toMatchObject({ channelId: channelA.id, running: true });
    const subscriptionCall = twitchFetchMock.mock.calls.find(([url]) => String(url).includes("/helix/eventsub/subscriptions"));
    expect(subscriptionCall[1].headers.Authorization).toBe("Bearer access-A");
    expect(JSON.stringify(getChannelIngestStatus(channelA.id))).not.toContain("access-A");
  });

  test("starting channel A twice does not create a duplicate connection", async () => {
    await startChannelIngest(channelA.id);
    const firstSocket = sockets.get(String(channelA.id));
    await startChannelIngest(channelA.id);
    expect(getAllIngestStatuses()).toHaveLength(1);
    expect(sockets.get(String(channelA.id))).toBe(firstSocket);
  });

  test("planned session reconnect migrates on the exact URL without creating another subscription", async () => {
    const initial = await startChannelIngest(channelA.id);
    await flushAsyncWork();
    const oldSocket = sockets.get(String(channelA.id));
    const reconnectUrl = "wss://eventsub.wss.twitch.tv/ws?reconnect=exact-token&keep=this";
    let replacementSocket = null;
    setTwitchIngestPoolWebSocketFactoryForTests((url) => {
      replacementSocket = new FakeWebSocket(url);
      socketInstances.push(replacementSocket);
      return replacementSocket;
    });

    emitEventSub(oldSocket, "session_reconnect", { session: { reconnect_url: reconnectUrl } });
    emitEventSub(oldSocket, "session_reconnect", { session: { reconnect_url: "wss://ignored.example/ws" } });
    await flushAsyncWork();

    expect(replacementSocket.url).toBe(reconnectUrl);
    expect(socketInstances).toHaveLength(2);
    expect(oldSocket.closeCalls).toBe(0);
    expect(getChannelIngestStatus(channelA.id)).toMatchObject({
      sessionId: initial.sessionId,
      subscriptionId: initial.subscriptionId,
      status: "reconnecting",
    });
    expect(getTwitchIngestPoolDebugStateForTests(channelA.id)).toMatchObject({
      hasWebSocket: true,
      hasPendingWebSocket: true,
      pendingKind: "migration",
    });
    expect(eventSubSubscriptionCalls()).toHaveLength(1);

    emitWelcome(replacementSocket, "migrated-session");
    await flushAsyncWork();

    expect(getChannelIngestStatus(channelA.id)).toMatchObject({
      sessionId: "migrated-session",
      subscriptionId: initial.subscriptionId,
      status: "running",
      running: true,
    });
    expect(eventSubSubscriptionCalls()).toHaveLength(1);
    expect(oldSocket.closeCalls).toBe(1);
    expect(getTwitchIngestPoolDebugStateForTests(channelA.id).timers.reconnect).toBe(false);
    expect(socketInstances).toHaveLength(2);
  });

  test("unexpected close reconnects on the base URL and creates a fresh reader-backed subscription", async () => {
    await startChannelIngest(channelA.id);
    await flushAsyncWork();
    vi.useFakeTimers({ now: Date.now() });
    setTwitchEventSubTimingForTests({ reconnectBaseMs: 100, reconnectMaxMs: 1_000, reconnectJitterRatio: 0 }, () => 0.5);
    const oldSocket = sockets.get(String(channelA.id));
    let replacementSocket = null;
    setTwitchIngestPoolWebSocketFactoryForTests((url, channelId) => {
      replacementSocket = new FakeWebSocket(url);
      socketInstances.push(replacementSocket);
      sockets.set(String(channelId), replacementSocket);
      queueMicrotask(() => emitWelcome(replacementSocket, "fresh-session"));
      return replacementSocket;
    });

    oldSocket.readyState = 3;
    oldSocket.emit("close", 1006);
    oldSocket.emit("close", 1006);
    expect(getChannelIngestStatus(channelA.id)).toMatchObject({
      status: "reconnecting",
      running: false,
      sessionId: null,
      subscriptionId: null,
      reconnectAttempts: 1,
    });
    expect(getTwitchIngestPoolDebugStateForTests(channelA.id).timers.reconnect).toBe(true);

    await vi.advanceTimersByTimeAsync(100);
    await flushAsyncWork();

    const status = getChannelIngestStatus(channelA.id);
    expect(replacementSocket.url).toBe("wss://eventsub.wss.twitch.tv/ws?keepalive_timeout_seconds=30");
    expect(status).toMatchObject({ status: "running", running: true, sessionId: "fresh-session", reconnectAttempts: 0 });
    expect(eventSubSubscriptionCalls()).toHaveLength(2);
    const request = eventSubSubscriptionCalls()[1][1];
    expect(request.headers.Authorization).toBe("Bearer access-A");
    expect(JSON.parse(request.body).condition).toEqual({
      broadcaster_user_id: channelA.twitch_broadcaster_id,
      user_id: "broadcaster-A",
    });
  });

  test("reconnect backoff increases, is capped, and keeps one timer per channel", async () => {
    await startChannelIngest(channelA.id);
    await flushAsyncWork();
    vi.useFakeTimers({ now: new Date("2026-07-12T12:00:00Z") });
    setTwitchEventSubTimingForTests({ reconnectBaseMs: 100, reconnectMaxMs: 250, reconnectJitterRatio: 0 }, () => 0.5);
    const reconnectTimes = [];
    setTwitchIngestPoolWebSocketFactoryForTests((url) => {
      reconnectTimes.push(Date.now());
      const socket = new FakeWebSocket(url);
      queueMicrotask(() => {
        socket.readyState = 3;
        socket.emit("close", 1006);
      });
      return socket;
    });
    const oldSocket = sockets.get(String(channelA.id));
    oldSocket.readyState = 3;
    oldSocket.emit("close", 1006);
    oldSocket.emit("close", 1006);
    expect(getTwitchIngestPoolDebugStateForTests(channelA.id)).toMatchObject({ reconnectAttempts: 1 });

    await vi.advanceTimersByTimeAsync(800);
    await flushAsyncWork();

    expect(reconnectTimes.slice(0, 4).map((time) => time - Date.parse("2026-07-12T12:00:00Z"))).toEqual([100, 300, 550, 800]);
    expect(getTwitchIngestPoolDebugStateForTests(channelA.id).timers.reconnect).toBe(true);
  });

  test("manual stop during reconnect prevents a late Welcome from becoming active", async () => {
    await startChannelIngest(channelA.id);
    await flushAsyncWork();
    vi.useFakeTimers();
    setTwitchEventSubTimingForTests({ reconnectBaseMs: 100, reconnectMaxMs: 1_000, reconnectJitterRatio: 0 }, () => 0.5);
    let pendingSocket = null;
    setTwitchIngestPoolWebSocketFactoryForTests((url) => {
      pendingSocket = new FakeWebSocket(url);
      return pendingSocket;
    });
    const oldSocket = sockets.get(String(channelA.id));
    oldSocket.readyState = 3;
    oldSocket.emit("close", 1006);
    await vi.advanceTimersByTimeAsync(100);
    expect(pendingSocket).not.toBeNull();

    stopChannelIngest(channelA.id);
    emitWelcome(pendingSocket, "obsolete-session");
    await flushAsyncWork();

    expect(getChannelIngestStatus(channelA.id)).toMatchObject({ status: "stopped", running: false, sessionId: null });
    expect(getTwitchIngestPoolDebugStateForTests(channelA.id)).toMatchObject({
      desiredRunning: false,
      hasWebSocket: false,
      hasPendingWebSocket: false,
    });
    expect(eventSubSubscriptionCalls()).toHaveLength(1);
  });

  test("shutdown waits for graceful WebSocket close without terminating it", async () => {
    await startChannelIngest(channelA.id);
    const socket = sockets.get(String(channelA.id));
    let stateWhenCloseStarted = null;
    socket.onClose = () => {
      stateWhenCloseStarted = getTwitchIngestPoolDebugStateForTests(channelA.id);
    };

    await shutdownAllIngest({ timeoutMs: 25 });

    expect(stateWhenCloseStarted).toEqual(expect.objectContaining({
      desiredRunning: false,
      timers: { poll: false, reconnect: false, watchdog: false },
    }));
    expect(socket.closeCalls).toBe(1);
    expect(socket.terminateCalls).toBe(0);
    expect(getChannelIngestStatus(channelA.id)).toMatchObject({ running: false, status: "stopped" });
    await expect(startChannelIngest(channelB.id)).rejects.toMatchObject({ status: 503 });
    expect(socketInstances).toHaveLength(1);

    const messageCount = getDatabase().prepare("SELECT COUNT(*) AS count FROM chat_messages").get().count;
    socket.emit("message", JSON.stringify({
      metadata: { message_type: "notification", message_timestamp: "2026-07-04T18:06:00Z" },
      payload: {
        subscription: { type: "channel.chat.message" },
        event: {
          broadcaster_user_id: channelA.twitch_broadcaster_id,
          chatter_user_login: "late-viewer",
          message_id: "late-message",
          message: { text: "late message" },
        },
      },
    }));
    expect(getDatabase().prepare("SELECT COUNT(*) AS count FROM chat_messages").get().count).toBe(messageCount);
    expect(getTwitchIngestPoolDebugStateForTests(channelA.id).timers).toEqual({ poll: false, reconnect: false, watchdog: false });
  });

  test("shutdown closes a pending WebSocket and settles its startup operation", async () => {
    let pendingSocket = null;
    setTwitchIngestPoolWebSocketFactoryForTests(() => {
      pendingSocket = new FakeWebSocket();
      return pendingSocket;
    });
    const starting = startChannelIngest(channelA.id);
    for (let attempt = 0; attempt < 20 && !pendingSocket; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(pendingSocket).not.toBeNull();

    await shutdownAllIngest({ timeoutMs: 25 });

    await expect(starting).resolves.toMatchObject({ channelId: channelA.id, running: false, status: "stopped" });
    expect(pendingSocket.closeCalls).toBe(1);
    expect(pendingSocket.terminateCalls).toBe(0);
  });

  test("shutdown terminates a WebSocket only after its graceful close timeout", async () => {
    await startChannelIngest(channelA.id);
    const socket = sockets.get(String(channelA.id));
    socket.deferClose = true;

    await shutdownAllIngest({ timeoutMs: 10 });

    expect(socket.closeCalls).toBe(1);
    expect(socket.terminateCalls).toBe(1);
    expect(getChannelIngestStatus(channelA.id)).toMatchObject({ running: false, status: "stopped" });
  });

  test("shutdown closes every channel socket and remains idempotent", async () => {
    await startChannelIngest(channelA.id);
    await startChannelIngest(channelB.id);
    const socketA = sockets.get(String(channelA.id));
    const socketB = sockets.get(String(channelB.id));

    const first = shutdownAllIngest({ timeoutMs: 25 });
    const second = shutdownAllIngest({ timeoutMs: 25 });
    await Promise.all([first, second]);

    expect(socketA.closeCalls).toBe(1);
    expect(socketB.closeCalls).toBe(1);
    expect(getChannelIngestStatus(channelA.id).status).toBe("stopped");
    expect(getChannelIngestStatus(channelB.id).status).toBe("stopped");
  });

  test("shutdown clears an already scheduled reconnect and never opens a replacement socket", async () => {
    await startChannelIngest(channelA.id);
    const socket = sockets.get(String(channelA.id));
    socket.emit("close");
    expect(getTwitchIngestPoolDebugStateForTests(channelA.id).timers.reconnect).toBe(true);

    await shutdownAllIngest({ timeoutMs: 25 });

    expect(getTwitchIngestPoolDebugStateForTests(channelA.id).timers.reconnect).toBe(false);
    expect(socketInstances).toHaveLength(1);
  });

  test("shutdown handles sockets that are already closing or closed", async () => {
    await startChannelIngest(channelA.id);
    await startChannelIngest(channelB.id);
    const closingSocket = sockets.get(String(channelA.id));
    const closedSocket = sockets.get(String(channelB.id));
    closingSocket.readyState = 2;
    closingSocket.deferClose = true;
    closedSocket.readyState = 3;

    await shutdownAllIngest({ timeoutMs: 10 });

    expect(closingSocket.closeCalls).toBe(0);
    expect(closingSocket.terminateCalls).toBe(1);
    expect(closedSocket.closeCalls).toBe(0);
    expect(closedSocket.terminateCalls).toBe(0);
  });

  test("production Fenya compatibility start reuses the numeric channel ingest", async () => {
    process.env.NODE_ENV = "production";
    process.env.TWITCH_CHANNEL_LOGIN = channelA.twitch_login;
    await startChannelIngest(channelA.id);
    const response = await request(app)
      .post("/api/twitch/fenya/ingest/start")
      .set("Cookie", ownerCookie);
    expect(response.status).toBe(202);
    expect(response.body.channelId).toBe(channelA.id);
    expect(socketInstances).toHaveLength(1);
    expect(getAllIngestStatuses()).toHaveLength(1);
  });

  test("production Fenya compatibility status delegates to the numeric channel", async () => {
    process.env.NODE_ENV = "production";
    process.env.TWITCH_CHANNEL_LOGIN = channelA.twitch_login;
    await startChannelIngest(channelA.id);
    const response = await request(app).get("/api/twitch/fenya/ingest/status");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ channelId: channelA.id, running: true });
    expect(socketInstances).toHaveLength(1);
  });

  test("Fenya connection diagnostics report database OAuth without exposing token values", async () => {
    process.env.NODE_ENV = "production";
    process.env.TWITCH_CHANNEL_LOGIN = channelA.twitch_login;
    const response = await request(app).get("/api/twitch/fenya/connection");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      channelFound: true,
      channelHasOwner: true,
      ingestAccountFound: true,
      oauthAccountFound: true,
      readerLogin: "channel-a",
      readerUserId: "broadcaster-A",
      hasUserAccessToken: true,
      hasRefreshToken: true,
      userTokenValid: true,
      needsReauth: false,
      tokenSource: "database_oauth",
    });
    expect(response.text).not.toContain("access-A");
    expect(response.text).not.toContain("refresh-A");
    expect(response.text).not.toContain("client-secret");
  });

  test("channels A and B run as independent pool entries", async () => {
    await startChannelIngest(channelA.id);
    await startChannelIngest(channelB.id);
    expect(getAllIngestStatuses()).toHaveLength(2);
    expect(sockets.get(String(channelA.id))).not.toBe(sockets.get(String(channelB.id)));
  });

  test("stopping A does not stop B and statuses remain separate", async () => {
    await startChannelIngest(channelA.id);
    await startChannelIngest(channelB.id);
    stopChannelIngest(channelA.id);
    expect(getChannelIngestStatus(channelA.id).running).toBe(false);
    expect(getChannelIngestStatus(channelB.id).running).toBe(true);
  });

  test("messages from A and B persist with their own channel and stream session", async () => {
    await startChannelIngest(channelA.id);
    await startChannelIngest(channelB.id);
    for (const [channel, suffix] of [[channelA, "A"], [channelB, "B"]]) {
      sockets.get(String(channel.id)).emit("message", JSON.stringify({
        metadata: { message_type: "notification", message_timestamp: "2026-07-04T18:06:00Z" },
        payload: {
          subscription: { type: "channel.chat.message" },
          event: {
            broadcaster_user_id: `broadcaster-${suffix}`,
            broadcaster_user_login: `channel-${suffix.toLowerCase()}`,
            chatter_user_login: `viewer-${suffix}`,
            message_id: `message-${suffix}`,
            message: { text: `message from ${suffix}` },
          },
        },
      }));
    }
    const rows = getDatabase().prepare("SELECT channel_id, stream_session_id FROM chat_messages ORDER BY channel_id").all();
    expect(rows).toEqual([
      { channel_id: channelA.id, stream_session_id: "stream-A" },
      { channel_id: channelB.id, stream_session_id: "stream-B" },
    ]);
  });

  test("unauthorized user cannot start channel ingest", async () => {
    const response = await request(app).post(`/api/channels/${channelA.id}/ingest/start`).set("Cookie", outsiderCookie);
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "forbidden", message: "Insufficient permissions" });
    expect(getAllIngestStatuses()).toHaveLength(0);
  });

  test("chatter cannot start or stop channel ingest", async () => {
    const startResponse = await request(app).post(`/api/channels/${channelA.id}/ingest/start`).set("Cookie", chatterCookie);
    expect(startResponse.status).toBe(403);
    expect(startResponse.body).toEqual({ error: "forbidden", message: "Insufficient permissions" });

    await startChannelIngest(channelA.id);
    const stopResponse = await request(app).post(`/api/channels/${channelA.id}/ingest/stop`).set("Cookie", chatterCookie);
    expect(stopResponse.status).toBe(403);
    expect(stopResponse.body).toEqual({ error: "forbidden", message: "Insufficient permissions" });
    expect(getChannelIngestStatus(channelA.id).running).toBe(true);
  });

  test("moderator remains read-only for ingest controls", async () => {
    const response = await request(app).post(`/api/channels/${channelA.id}/ingest/start`).set("Cookie", moderatorCookie);
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "forbidden", message: "Insufficient permissions" });
  });

  test("channel owner can control ingest", async () => {
    const started = await request(app).post(`/api/channels/${channelA.id}/ingest/start`).set("Cookie", ownerCookie);
    expect(started.status).toBe(202);
    const stopped = await request(app).post(`/api/channels/${channelA.id}/ingest/stop`).set("Cookie", ownerCookie);
    expect(stopped.status).toBe(200);
    expect(stopped.body.running).toBe(false);
  });

  test("platform admin can control ingest without a channel membership", async () => {
    const started = await request(app).post(`/api/channels/${channelA.id}/ingest/start`).set("Cookie", platformAdminCookie);
    expect(started.status).toBe(202);
    const stopped = await request(app).post(`/api/channels/${channelA.id}/ingest/stop`).set("Cookie", platformAdminCookie);
    expect(stopped.status).toBe(200);
    expect(stopped.body.running).toBe(false);
  });

  test("linked reader can control ownerless Fenya ingest while an unrelated user cannot", async () => {
    const readerProfile = { id: "broadcaster-reader-control", login: "reader-control", display_name: "Reader" };
    const reader = findOrCreateUserFromTwitchProfile(readerProfile);
    const account = upsertTwitchAccount(reader.id, readerProfile, {
      accessToken: "access-reader-control",
      refreshToken: "refresh-reader-control",
      scopes: ["user:read:chat"],
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
    const monitored = findOrCreateChannelFromBroadcaster({ id: "monitored-control", login: "fenya-reader", display_name: "Fenya" });
    setChannelIngestTwitchAccount(monitored.id, account.id);
    process.env.NODE_ENV = "production";
    process.env.TWITCH_CHANNEL_LOGIN = monitored.twitch_login;
    const readerCookie = `${SESSION_COOKIE_NAME}=${startSession(reader.id).rawToken}`;

    const denied = await request(app).post("/api/twitch/fenya/ingest/start").set("Cookie", outsiderCookie);
    expect(denied.status).toBe(403);
    const unrelatedMutation = await request(app).post("/api/twitch/fenya/poll-once").set("Cookie", readerCookie);
    expect(unrelatedMutation.status).toBe(403);
    const started = await request(app).post("/api/twitch/fenya/ingest/start").set("Cookie", readerCookie);
    expect(started.status).toBe(202);
    const stopped = await request(app).post("/api/twitch/fenya/ingest/stop").set("Cookie", readerCookie);
    expect(stopped.status).toBe(200);
    expect(stopped.body.running).toBe(false);
  });

  test("Fenya compatibility status route still works", async () => {
    const response = await request(app).get("/api/twitch/fenya/ingest/status");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ channelId: "legacy:fenya", running: false, status: "stopped" });
  });
});
