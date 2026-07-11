import process from "node:process";

import WebSocket from "ws";

import { HttpError } from "../middleware/errorHandlers.js";
import { findChannelById } from "../repositories/channelRepository.js";
import { saveTwitchChatMessage, saveTwitchStreamSnapshot } from "../repositories/twitchIngestRepository.js";
import { findTwitchAccountById } from "../repositories/twitchAccountRepository.js";
import { getConfiguredUserToken, refreshUserAccessToken, validateUserToken } from "./twitchAuthService.js";
import { twitchHelixRequest } from "./twitchHelixClient.js";
import { getTwitchProviderName, loadTwitchChannelMetadata } from "./twitchMetadataService.js";
import { validateOAuthAccessToken } from "./twitchOAuthService.js";
import { getValidUserAccessTokenForAccount } from "./twitchTokenRefreshService.js";
import { getDatabase } from "../storage/db.js";

const EVENTSUB_URL = "wss://eventsub.wss.twitch.tv/ws?keepalive_timeout_seconds=30";
const REQUIRED_CHAT_SCOPE = "user:read:chat";
const START_TIMEOUT_MS = 15_000;
const WEBSOCKET_CLOSE_TIMEOUT_MS = 1_500;
const ingestPool = new Map();
let createWebSocket = (url) => new WebSocket(url);
let ingestPoolShuttingDown = false;

function interval(name, fallback) {
  const value = Number(process.env[name] || fallback);
  return Number.isFinite(value) && value >= 1_000 ? value : fallback;
}

function safeError(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function createState(channelId) {
  return {
    channelId,
    broadcasterId: null,
    chatReaderUserId: null,
    status: "stopped",
    running: false,
    desiredRunning: false,
    sessionId: null,
    subscriptionId: null,
    currentStreamId: null,
    streamStartedAt: null,
    collectedFrom: null,
    connectedAt: null,
    lastEventAt: null,
    lastPollAt: null,
    messagesStoredRuntime: 0,
    reconnectAttempts: 0,
    lastError: null,
    websocket: null,
    pendingWebsocket: null,
    timers: { poll: null, reconnect: null, watchdog: null },
    startPromise: null,
    socketOpenPromise: null,
    channelLogin: null,
    twitchAccountId: null,
    legacy: false,
    closingSockets: new Set(),
  };
}

function stateFor(channelId) {
  const key = String(channelId);
  if (!ingestPool.has(key)) ingestPool.set(key, createState(channelId));
  return ingestPool.get(key);
}

function publicStatus(state) {
  const persistedMessagesStored = (() => {
    const database = getDatabase();
    if (state.channelId !== null && state.channelId !== "" && Number.isInteger(Number(state.channelId))) {
      return database.prepare("SELECT COUNT(*) AS count FROM chat_messages WHERE channel_id = ?")
        .get(Number(state.channelId)).count;
    }
    if (state.broadcasterId) {
      return database.prepare(`
        SELECT COUNT(*) AS count FROM chat_messages
        WHERE channel_id = (SELECT id FROM channels WHERE twitch_broadcaster_id = ?)
      `).get(state.broadcasterId).count;
    }
    return 0;
  })();
  return {
    provider: getTwitchProviderName(),
    channelId: state.channelId,
    channelLogin: state.channelLogin,
    broadcasterId: state.broadcasterId,
    chatReaderUserId: state.chatReaderUserId,
    chatUserId: state.chatReaderUserId,
    status: state.status,
    running: state.running,
    sessionId: state.sessionId,
    subscriptionId: state.subscriptionId,
    currentStreamId: state.currentStreamId,
    streamStartedAt: state.streamStartedAt,
    collectedFrom: state.collectedFrom,
    connectedAt: state.connectedAt,
    lastEventAt: state.lastEventAt,
    lastPollAt: state.lastPollAt,
    messagesStoredRuntime: state.messagesStoredRuntime,
    persistedMessagesStored,
    messagesStored: state.messagesStoredRuntime,
    reconnectAttempts: state.reconnectAttempts,
    lastError: state.lastError,
    pollIntervalMs: interval("TWITCH_POLL_INTERVAL_MS", 30_000),
    reconnectIntervalMs: interval("TWITCH_EVENTSUB_RECONNECT_MS", 5_000),
  };
}

function clearStateTimer(state, name) {
  if (state.timers[name]) clearTimeout(state.timers[name]);
  state.timers[name] = null;
}

async function resolveIdentity(state, options) {
  if (options.legacy) {
    if (!getConfiguredUserToken()) throw new HttpError(503, "Missing TWITCH_USER_ACCESS_TOKEN");
    let tokenInfo;
    try {
      tokenInfo = await validateUserToken();
    } catch (error) {
      try {
        if (!process.env.TWITCH_REFRESH_TOKEN?.trim()) throw error;
        await refreshUserAccessToken();
        tokenInfo = await validateUserToken();
      } catch (refreshError) {
        throw new HttpError(401, "Configured Twitch user token is invalid", { cause: refreshError });
      }
    }
    state.legacy = true;
    state.channelLogin = options.channelLogin || process.env.TWITCH_CHANNEL_LOGIN || "fenya";
    state.broadcasterId = options.broadcasterId || process.env.TWITCH_BROADCASTER_ID?.trim() || null;
    state.chatReaderUserId = tokenInfo?.user_id;
    if (!state.chatReaderUserId) throw new HttpError(401, "Validated Twitch user token has no chat reader user id");
    if (process.env.TWITCH_BOT_USER_ID?.trim() && process.env.TWITCH_BOT_USER_ID.trim() !== state.chatReaderUserId) {
      throw new HttpError(409, "TWITCH_BOT_USER_ID does not match the configured user token");
    }
    if (!tokenInfo?.scopes?.includes(REQUIRED_CHAT_SCOPE)) throw new HttpError(403, `Twitch user token requires scope ${REQUIRED_CHAT_SCOPE}`);
    return;
  }

  const channel = findChannelById(state.channelId);
  if (!channel) throw new HttpError(404, "Channel not found");
  const account = channel.ingest_twitch_account_id ? findTwitchAccountById(channel.ingest_twitch_account_id) : null;
  if (!account) throw new HttpError(409, "Channel has no linked Twitch chat reader account");
  const token = await getValidUserAccessTokenForAccount(account.id);
  const tokenInfo = await validateOAuthAccessToken(token);
  if (!tokenInfo.scopes?.includes(REQUIRED_CHAT_SCOPE)) throw new HttpError(403, `Twitch user token requires scope ${REQUIRED_CHAT_SCOPE}`);
  if (String(tokenInfo.user_id) !== String(account.twitch_user_id)) {
    throw new HttpError(401, "Twitch chat reader token does not match the linked account");
  }
  state.channelLogin = channel.twitch_login;
  state.broadcasterId = channel.twitch_broadcaster_id;
  state.chatReaderUserId = account.twitch_user_id;
  state.twitchAccountId = account.id;
}

async function getLegacyValidUserToken(state) {
  let tokenInfo;
  try {
    tokenInfo = await validateUserToken();
  } catch (error) {
    if (!process.env.TWITCH_REFRESH_TOKEN?.trim()) throw error;
    await refreshUserAccessToken();
    tokenInfo = await validateUserToken();
  }
  if (!tokenInfo?.user_id || !tokenInfo.scopes?.includes(REQUIRED_CHAT_SCOPE)) {
    throw new HttpError(401, "Legacy Twitch authorization must be reconnected");
  }
  state.chatReaderUserId = tokenInfo.user_id;
  return getConfiguredUserToken();
}

async function pollOnce(state) {
  const metadata = await loadTwitchChannelMetadata(state.channelLogin);
  if (ingestPoolShuttingDown || !state.desiredRunning) {
    throw new HttpError(503, "Twitch ingest stopped before polling completed");
  }
  const timestamp = new Date().toISOString();
  state.lastPollAt = timestamp;
  state.broadcasterId = state.broadcasterId || metadata.broadcasterId;
  if (!state.broadcasterId) throw new HttpError(404, `Twitch broadcaster was not found for ${state.channelLogin}`);
  state.currentStreamId = saveTwitchStreamSnapshot(metadata, timestamp, {
    channelId: state.legacy ? null : state.channelId,
    streamSessionId: metadata.streamId,
    collectedFrom: state.collectedFrom ?? timestamp,
  });
  state.streamStartedAt = metadata.startedAt ?? null;
  if (state.currentStreamId) {
    const storedWindow = getDatabase().prepare("SELECT collected_from FROM streams WHERE stream_id = ?").get(state.currentStreamId);
    state.collectedFrom = storedWindow?.collected_from ?? state.collectedFrom ?? timestamp;
  }
  return metadata;
}

function schedulePolling(state) {
  clearStateTimer(state, "poll");
  if (ingestPoolShuttingDown || !state.desiredRunning) return;
  state.timers.poll = setTimeout(async () => {
    if (ingestPoolShuttingDown || !state.desiredRunning) return;
    try {
      await pollOnce(state);
      state.lastError = null;
    } catch (error) {
      state.lastError = safeError(error, "Twitch stream polling failed");
    }
    if (!ingestPoolShuttingDown && state.desiredRunning) schedulePolling(state);
  }, interval("TWITCH_POLL_INTERVAL_MS", 30_000));
  state.timers.poll.unref?.();
}

async function createSubscription(state, sessionId) {
  let auth;
  if (state.twitchAccountId) {
    auth = { twitchAccountId: state.twitchAccountId };
  } else {
    let token = await getLegacyValidUserToken(state);
    auth = { token };
  }
  let payload;
  try {
    payload = await twitchHelixRequest("/eventsub/subscriptions", {
      ...auth,
      method: "POST",
      body: {
        type: "channel.chat.message",
        version: "1",
        condition: { broadcaster_user_id: state.broadcasterId, user_id: state.chatReaderUserId },
        transport: { method: "websocket", session_id: sessionId },
      },
    });
  } catch (error) {
    if (!state.twitchAccountId && error?.status === 401) {
      await refreshUserAccessToken();
      const token = await getLegacyValidUserToken(state);
      payload = await twitchHelixRequest("/eventsub/subscriptions", {
        token,
        method: "POST",
        body: {
          type: "channel.chat.message",
          version: "1",
          condition: { broadcaster_user_id: state.broadcasterId, user_id: state.chatReaderUserId },
          transport: { method: "websocket", session_id: sessionId },
        },
      });
    } else {
      throw new HttpError(error?.status === 401 ? 401 : 502, error?.status === 401
        ? "Twitch account requires reauthorization"
        : "Twitch EventSub subscription failed", { cause: error });
    }
  }
  state.subscriptionId = payload.data?.[0]?.id ?? null;
  if (!state.subscriptionId) throw new HttpError(502, "Twitch EventSub subscription failed");
}

function armWatchdog(state, socket, timeoutSeconds) {
  clearStateTimer(state, "watchdog");
  state.timers.watchdog = setTimeout(() => {
    if (state.websocket === socket && state.desiredRunning) socket.terminate();
  }, (Number(timeoutSeconds) || 30) * 1000 + 5_000);
  state.timers.watchdog.unref?.();
}

export function processChannelEventSubNotification(channelId, message) {
  const state = ingestPool.get(String(channelId));
  if (ingestPoolShuttingDown || !state?.desiredRunning || message?.metadata?.message_type !== "notification") return null;
  if (message.payload?.subscription?.type !== "channel.chat.message") return null;
  if (message.payload.event?.broadcaster_user_id !== state.broadcasterId) return null;
  const timestamp = message.metadata.message_timestamp || new Date().toISOString();
  const result = saveTwitchChatMessage(message.payload.event, timestamp, {
    channelId: state.legacy ? null : state.channelId,
    streamSessionId: state.currentStreamId,
    collectedFrom: state.collectedFrom ?? timestamp,
  });
  state.currentStreamId = result.streamId;
  state.lastEventAt = timestamp;
  if (result.stored) state.messagesStoredRuntime += 1;
  return result;
}

function scheduleReconnect(state) {
  if (ingestPoolShuttingDown || !state.desiredRunning || state.timers.reconnect) return;
  state.status = "reconnecting";
  state.running = false;
  state.reconnectAttempts += 1;
  state.timers.reconnect = setTimeout(() => {
    state.timers.reconnect = null;
    openSocket(state, EVENTSUB_URL, true).catch((error) => {
      state.lastError = safeError(error, "Twitch EventSub reconnect failed");
      scheduleReconnect(state);
    });
  }, interval("TWITCH_EVENTSUB_RECONNECT_MS", 5_000));
  state.timers.reconnect.unref?.();
}

function openSocket(state, url, shouldSubscribe) {
  if (ingestPoolShuttingDown || !state.desiredRunning) {
    return Promise.reject(new HttpError(503, "Twitch ingest is shutting down"));
  }
  if (state.socketOpenPromise) return state.socketOpenPromise;
  const operation = new Promise((resolve, reject) => {
    const previousSocket = state.websocket;
    const socket = createWebSocket(url, state.channelId);
    state.pendingWebsocket = socket;
    let settled = false;
    const startTimeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        socket.terminate();
        reject(new HttpError(504, "Timed out waiting for Twitch EventSub welcome"));
      }
    }, START_TIMEOUT_MS);
    startTimeout.unref?.();

    socket.on("message", async (raw) => {
      if (ingestPoolShuttingDown || !state.desiredRunning) return;
      let message;
      try { message = JSON.parse(raw.toString()); } catch { state.lastError = "Received invalid Twitch EventSub JSON"; return; }
      const session = message.payload?.session;
      armWatchdog(state, socket, session?.keepalive_timeout_seconds);
      try {
        if (message.metadata?.message_type === "session_welcome") {
          if (ingestPoolShuttingDown || !state.desiredRunning) {
            socket.close(1000, "Twitch ingest stopping");
            return;
          }
          state.websocket = socket;
          state.pendingWebsocket = null;
          state.sessionId = session.id;
          state.connectedAt = session.connected_at || new Date().toISOString();
          state.status = shouldSubscribe ? "subscribing" : "running";
          if (shouldSubscribe) await createSubscription(state, session.id);
          state.status = "running";
          state.running = true;
          state.lastError = null;
          schedulePolling(state);
          if (previousSocket && previousSocket !== socket) previousSocket.close(1000, "EventSub reconnect complete");
          if (!settled) { settled = true; clearTimeout(startTimeout); resolve(publicStatus(state)); }
        } else if (message.metadata?.message_type === "notification") {
          processChannelEventSubNotification(state.channelId, message);
        } else if (message.metadata?.message_type === "session_reconnect") {
          state.status = "reconnecting";
          openSocket(state, session.reconnect_url, false).catch((error) => {
            state.lastError = safeError(error, "Twitch EventSub migration failed");
            scheduleReconnect(state);
          });
        } else if (message.metadata?.message_type === "revocation") {
          state.lastError = `Twitch revoked ${message.payload?.subscription?.type || "EventSub subscription"}`;
          state.status = "error";
          state.running = false;
        }
      } catch (error) {
        state.lastError = safeError(error, "Twitch EventSub message handling failed");
        state.status = "error";
        state.running = false;
        if (!settled) {
          settled = true;
          state.desiredRunning = false;
          clearTimeout(startTimeout);
          socket.close(1000, "Twitch EventSub setup failed");
          reject(error);
        }
      }
    });
    socket.on("error", (error) => {
      state.lastError = safeError(error, "Twitch EventSub WebSocket error");
      if (!settled) { settled = true; clearTimeout(startTimeout); reject(new HttpError(502, state.lastError)); }
    });
    socket.on("close", () => {
      if (state.closingSockets.has(socket)) {
        state.closingSockets.delete(socket);
        if (state.websocket === socket) state.websocket = null;
        if (state.pendingWebsocket === socket) state.pendingWebsocket = null;
        if (!settled) {
          settled = true;
          clearTimeout(startTimeout);
          resolve(publicStatus(state));
        }
        return;
      }
      if (!settled) {
        settled = true;
        clearTimeout(startTimeout);
        state.pendingWebsocket = null;
        if (state.desiredRunning) reject(new HttpError(502, "Twitch EventSub WebSocket closed before welcome"));
        else resolve(publicStatus(state));
        return;
      }
      if (state.websocket !== socket || !state.desiredRunning) return;
      clearStateTimer(state, "watchdog");
      state.websocket = null;
      state.sessionId = null;
      state.running = false;
      scheduleReconnect(state);
    });
  });
  state.socketOpenPromise = operation;
  operation.then(
    () => { if (state.socketOpenPromise === operation) state.socketOpenPromise = null; },
    () => { if (state.socketOpenPromise === operation) state.socketOpenPromise = null; },
  );
  return operation;
}

export async function startChannelIngest(channelId, options = {}) {
  if (ingestPoolShuttingDown) throw new HttpError(503, "Twitch ingest is shutting down");
  if (getTwitchProviderName() !== "twitch") throw new HttpError(409, "Twitch ingest requires TWITCH_PROVIDER=twitch");
  const state = stateFor(channelId);
  if (state.desiredRunning) return state.startPromise || publicStatus(state);
  state.desiredRunning = true;
  state.status = "connecting";
  state.lastError = null;
  state.startPromise = (async () => {
    try {
      await resolveIdentity(state, options);
      state.collectedFrom = new Date().toISOString();
      console.log(`Twitch ingest starting: channel=@${state.channelLogin}, collectedFrom=${state.collectedFrom}`);
      const metadata = await pollOnce(state);
      state.broadcasterId = state.broadcasterId || metadata.broadcasterId;
      if (!state.broadcasterId) throw new HttpError(404, "Twitch broadcaster id is missing");
      if (!state.chatReaderUserId) throw new HttpError(401, "Twitch chat reader user id is missing");
      console.log(`Twitch ingest listening: channel=@${state.channelLogin}, streamStartedAt=${state.streamStartedAt ?? "offline"}, collectedFrom=${state.collectedFrom}`);
      return await openSocket(state, EVENTSUB_URL, true);
    } catch (error) {
      state.desiredRunning = false;
      state.running = false;
      state.status = "error";
      state.lastError = safeError(error, "Twitch ingest failed to start");
      throw error;
    } finally {
      state.startPromise = null;
    }
  })();
  return state.startPromise;
}

function prepareStateForStop(state) {
  state.desiredRunning = false;
  state.running = false;
  state.status = "stopped";
  for (const name of Object.keys(state.timers)) clearStateTimer(state, name);
  const sockets = [...new Set([state.websocket, state.pendingWebsocket].filter(Boolean))];
  for (const socket of sockets) state.closingSockets.add(socket);
  return sockets;
}

function finishStateStop(state, sockets) {
  for (const socket of sockets) state.closingSockets.delete(socket);
  if (sockets.includes(state.websocket)) state.websocket = null;
  if (sockets.includes(state.pendingWebsocket)) state.pendingWebsocket = null;
  state.sessionId = null;
  state.subscriptionId = null;
  state.status = "stopped";
}

function closeWebSocketGracefully(socket, timeoutMs) {
  if (!socket || socket.readyState === WebSocket.CLOSED) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.removeListener?.("close", finish);
      resolve();
    };
    const timer = setTimeout(() => {
      try { socket.terminate(); } catch { /* The socket is already unavailable. */ }
      finish();
    }, timeoutMs);
    socket.once?.("close", finish);
    try {
      if (socket.readyState !== WebSocket.CLOSING) socket.close(1000, "Twitch ingest stopped");
    } catch {
      try { socket.terminate(); } catch { /* The socket is already unavailable. */ }
      finish();
    }
  });
}

export function stopChannelIngest(channelId) {
  const state = ingestPool.get(String(channelId));
  if (!state) return publicStatus(createState(channelId));
  const sockets = prepareStateForStop(state);
  void Promise.all(sockets.map((socket) => closeWebSocketGracefully(socket, WEBSOCKET_CLOSE_TIMEOUT_MS)))
    .then(() => finishStateStop(state, sockets));
  return publicStatus(state);
}

export async function restartChannelIngest(channelId) {
  const state = ingestPool.get(String(channelId));
  const options = state?.legacy ? { legacy: true, channelLogin: state.channelLogin, broadcasterId: state.broadcasterId } : {};
  stopChannelIngest(channelId);
  return startChannelIngest(channelId, options);
}

export function getChannelIngestStatus(channelId) {
  const state = ingestPool.get(String(channelId));
  return publicStatus(state || createState(channelId));
}

export function getAllIngestStatuses() {
  return [...ingestPool.values()].map(publicStatus);
}

export function stopAllIngest() {
  return [...ingestPool.values()].map((state) => stopChannelIngest(state.channelId));
}

export async function shutdownAllIngest({ timeoutMs = WEBSOCKET_CLOSE_TIMEOUT_MS } = {}) {
  ingestPoolShuttingDown = true;
  const states = [...ingestPool.values()];
  const closing = states.map((state) => {
    const sockets = prepareStateForStop(state);
    return Promise.all(sockets.map((socket) => closeWebSocketGracefully(socket, timeoutMs)))
      .then(() => finishStateStop(state, sockets));
  });
  await Promise.all(closing);
}

export function setTwitchIngestPoolWebSocketFactoryForTests(factory) {
  createWebSocket = factory || ((url) => new WebSocket(url));
}

export function getTwitchIngestPoolDebugStateForTests(channelId) {
  const state = ingestPool.get(String(channelId));
  if (!state) return null;
  return {
    desiredRunning: state.desiredRunning,
    hasWebSocket: Boolean(state.websocket),
    hasPendingWebSocket: Boolean(state.pendingWebsocket),
    timers: Object.fromEntries(Object.entries(state.timers).map(([name, timer]) => [name, Boolean(timer)])),
  };
}

export function resetTwitchIngestPoolForTests() {
  stopAllIngest();
  ingestPool.clear();
  ingestPoolShuttingDown = false;
  createWebSocket = (url) => new WebSocket(url);
}
