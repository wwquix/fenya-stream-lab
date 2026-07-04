import process from "node:process";

import WebSocket from "ws";

import { HttpError } from "../middleware/errorHandlers.js";
import { saveTwitchChatMessage, saveTwitchStreamSnapshot } from "../repositories/twitchIngestRepository.js";
import {
  getConfiguredUserToken,
  refreshUserAccessToken,
  validateUserToken,
} from "./twitchAuthService.js";
import { twitchHelixRequest } from "./twitchHelixClient.js";
import { getTwitchProviderName, loadTwitchChannelMetadata } from "./twitchMetadataService.js";

const EVENTSUB_URL = "wss://eventsub.wss.twitch.tv/ws?keepalive_timeout_seconds=30";
const REQUIRED_CHAT_SCOPE = "user:read:chat";
const START_TIMEOUT_MS = 15_000;

let createWebSocket = (url) => new WebSocket(url);
const state = {
  desiredRunning: false,
  status: "stopped",
  socket: null,
  sessionId: null,
  subscriptionId: null,
  broadcasterId: null,
  chatUserId: null,
  currentStreamId: null,
  connectedAt: null,
  lastEventAt: null,
  lastPollAt: null,
  lastError: null,
  messagesStored: 0,
  pollTimer: null,
  reconnectTimer: null,
  watchdogTimer: null,
};

function safeError(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function clearTimer(name) {
  if (state[name]) clearTimeout(state[name]);
  state[name] = null;
}

function pollIntervalMs() {
  const configured = Number(process.env.TWITCH_POLL_INTERVAL_MS || 30_000);
  return Number.isFinite(configured) && configured >= 1_000 ? configured : 30_000;
}

export function getTwitchIngestStatus() {
  return {
    provider: getTwitchProviderName(),
    status: state.status,
    running: state.status === "running",
    sessionId: state.sessionId,
    subscriptionId: state.subscriptionId,
    broadcasterId: state.broadcasterId,
    chatUserId: state.chatUserId,
    currentStreamId: state.currentStreamId,
    connectedAt: state.connectedAt,
    lastEventAt: state.lastEventAt,
    lastPollAt: state.lastPollAt,
    messagesStored: state.messagesStored,
    pollIntervalMs: pollIntervalMs(),
    lastError: state.lastError,
  };
}

async function validatedChatIdentity() {
  if (!getConfiguredUserToken()) throw new HttpError(503, "Missing TWITCH_USER_ACCESS_TOKEN");

  let tokenInfo;
  try {
    tokenInfo = await validateUserToken();
  } catch (error) {
    if (!process.env.TWITCH_REFRESH_TOKEN?.trim()) throw error;
    await refreshUserAccessToken();
    tokenInfo = await validateUserToken();
  }
  if (!tokenInfo?.user_id) throw new HttpError(401, "Twitch user token has no user_id");
  if (!tokenInfo.scopes.includes(REQUIRED_CHAT_SCOPE)) {
    throw new HttpError(403, `Twitch user token requires scope ${REQUIRED_CHAT_SCOPE}`);
  }

  const configuredBotId = process.env.TWITCH_BOT_USER_ID?.trim();
  if (configuredBotId && configuredBotId !== tokenInfo.user_id) {
    throw new HttpError(409, "TWITCH_BOT_USER_ID does not match the configured user token");
  }
  return tokenInfo;
}

export async function pollTwitchStreamOnce() {
  if (getTwitchProviderName() !== "twitch") {
    throw new HttpError(409, "Twitch ingest requires TWITCH_PROVIDER=twitch");
  }
  const metadata = await loadTwitchChannelMetadata();
  const timestamp = new Date().toISOString();
  state.lastPollAt = timestamp;
  state.broadcasterId = metadata.broadcasterId;
  state.currentStreamId = saveTwitchStreamSnapshot(metadata, timestamp);
  return metadata;
}

function schedulePolling() {
  clearTimer("pollTimer");
  state.pollTimer = setTimeout(async function poll() {
    if (!state.desiredRunning) return;
    try {
      await pollTwitchStreamOnce();
      state.lastError = null;
    } catch (error) {
      state.lastError = safeError(error, "Twitch stream polling failed");
    }
    schedulePolling();
  }, pollIntervalMs());
  state.pollTimer.unref?.();
}

async function createChatSubscription(sessionId) {
  const token = getConfiguredUserToken();
  const payload = await twitchHelixRequest("/eventsub/subscriptions", {
    token,
    method: "POST",
    body: {
      type: "channel.chat.message",
      version: "1",
      condition: {
        broadcaster_user_id: state.broadcasterId,
        user_id: state.chatUserId,
      },
      transport: { method: "websocket", session_id: sessionId },
    },
  });
  state.subscriptionId = payload.data?.[0]?.id ?? null;
}

function armWatchdog(socket, timeoutSeconds) {
  clearTimer("watchdogTimer");
  const timeoutMs = (Number(timeoutSeconds) || 30) * 1000 + 5_000;
  state.watchdogTimer = setTimeout(() => {
    if (state.socket === socket && state.desiredRunning) socket.terminate();
  }, timeoutMs);
  state.watchdogTimer.unref?.();
}

export function processEventSubNotification(message) {
  if (message?.metadata?.message_type !== "notification") return null;
  if (message.payload?.subscription?.type !== "channel.chat.message") return null;

  const timestamp = message.metadata.message_timestamp || new Date().toISOString();
  const result = saveTwitchChatMessage(message.payload.event, timestamp);
  state.currentStreamId = result.streamId;
  state.lastEventAt = timestamp;
  if (result.stored) state.messagesStored += 1;
  return result;
}

function scheduleReconnect() {
  if (!state.desiredRunning || state.reconnectTimer) return;
  state.status = "reconnecting";
  state.reconnectTimer = setTimeout(() => {
    state.reconnectTimer = null;
    openSocket(EVENTSUB_URL, true).catch((error) => {
      state.lastError = safeError(error, "Twitch EventSub reconnect failed");
      scheduleReconnect();
    });
  }, 2_000);
  state.reconnectTimer.unref?.();
}

function openSocket(url, shouldSubscribe) {
  return new Promise((resolve, reject) => {
    const previousSocket = state.socket;
    const socket = createWebSocket(url);
    let settled = false;
    const startTimeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        socket.terminate();
        reject(new HttpError(504, "Timed out waiting for Twitch EventSub welcome"));
      }
    }, START_TIMEOUT_MS);
    startTimeout.unref?.();

    socket.on("message", async (rawMessage) => {
      let message;
      try {
        message = JSON.parse(rawMessage.toString());
      } catch {
        state.lastError = "Received invalid Twitch EventSub JSON";
        return;
      }

      const session = message.payload?.session;
      armWatchdog(socket, session?.keepalive_timeout_seconds);
      try {
        switch (message.metadata?.message_type) {
          case "session_welcome":
            state.socket = socket;
            state.sessionId = session.id;
            state.connectedAt = session.connected_at || new Date().toISOString();
            state.status = shouldSubscribe ? "subscribing" : "running";
            if (shouldSubscribe) await createChatSubscription(session.id);
            state.status = "running";
            state.lastError = null;
            schedulePolling();
            if (previousSocket && previousSocket !== socket) previousSocket.close(1000, "EventSub reconnect complete");
            if (!settled) {
              settled = true;
              clearTimeout(startTimeout);
              resolve(getTwitchIngestStatus());
            }
            break;
          case "notification":
            processEventSubNotification(message);
            break;
          case "session_reconnect":
            state.status = "reconnecting";
            openSocket(session.reconnect_url, false).catch((error) => {
              state.lastError = safeError(error, "Twitch EventSub migration failed");
              scheduleReconnect();
            });
            break;
          case "revocation":
            state.lastError = `Twitch revoked ${message.payload?.subscription?.type || "EventSub subscription"}`;
            state.status = "error";
            break;
          default:
            break;
        }
      } catch (error) {
        state.lastError = safeError(error, "Twitch EventSub message handling failed");
        state.status = "error";
        if (!settled) {
          settled = true;
          clearTimeout(startTimeout);
          reject(error);
        }
      }
    });

    socket.on("error", (error) => {
      state.lastError = safeError(error, "Twitch EventSub WebSocket error");
      if (!settled) {
        settled = true;
        clearTimeout(startTimeout);
        reject(new HttpError(502, state.lastError));
      }
    });

    socket.on("close", () => {
      if (state.socket !== socket || !state.desiredRunning) return;
      clearTimer("watchdogTimer");
      state.socket = null;
      state.sessionId = null;
      scheduleReconnect();
    });
  });
}

export async function startTwitchIngest() {
  if (getTwitchProviderName() !== "twitch") {
    throw new HttpError(409, "Twitch ingest requires TWITCH_PROVIDER=twitch");
  }
  if (state.desiredRunning) return getTwitchIngestStatus();

  state.desiredRunning = true;
  state.status = "connecting";
  state.lastError = null;
  try {
    const tokenInfo = await validatedChatIdentity();
    state.chatUserId = tokenInfo.user_id;
    const metadata = await pollTwitchStreamOnce();
    state.broadcasterId = process.env.TWITCH_BROADCASTER_ID?.trim() || metadata.broadcasterId;
    return await openSocket(EVENTSUB_URL, true);
  } catch (error) {
    state.desiredRunning = false;
    state.status = "error";
    state.lastError = safeError(error, "Twitch ingest failed to start");
    throw error;
  }
}

export function stopTwitchIngest() {
  state.desiredRunning = false;
  clearTimer("pollTimer");
  clearTimer("reconnectTimer");
  clearTimer("watchdogTimer");
  if (state.socket) state.socket.close(1000, "Twitch ingest stopped");
  state.socket = null;
  state.sessionId = null;
  state.subscriptionId = null;
  state.status = "stopped";
  return getTwitchIngestStatus();
}

export function setTwitchWebSocketFactoryForTests(factory) {
  createWebSocket = factory || ((url) => new WebSocket(url));
}

export function resetTwitchIngestForTests() {
  stopTwitchIngest();
  state.broadcasterId = null;
  state.chatUserId = null;
  state.currentStreamId = null;
  state.connectedAt = null;
  state.lastEventAt = null;
  state.lastPollAt = null;
  state.lastError = null;
  state.messagesStored = 0;
  createWebSocket = (url) => new WebSocket(url);
}
