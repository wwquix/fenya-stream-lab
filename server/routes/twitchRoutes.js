import process from "node:process";

import { Router } from "express";

import { routeHandler } from "../middleware/errorHandlers.js";
import { getAppAccessToken, getConfiguredUserToken, validateUserToken } from "../services/twitchAuthService.js";
import {
  getTwitchIngestStatus,
  pollTwitchStreamOnce,
  startTwitchIngest,
  stopTwitchIngest,
} from "../services/twitchIngestService.js";
import { getTwitchProviderName, loadTwitchChannelMetadata } from "../services/twitchMetadataService.js";

const router = Router();

router.get("/fenya", routeHandler(async (_req, res) => {
  res.json(await loadTwitchChannelMetadata());
}, "Failed to load Twitch metadata"));

router.get("/fenya/connection", routeHandler(async (_req, res) => {
  const provider = getTwitchProviderName();
  let appTokenAvailable = false;
  let userTokenInfo = null;
  let lastError = null;

  if (provider === "twitch") {
    try {
      await getAppAccessToken();
      appTokenAvailable = true;
      userTokenInfo = await validateUserToken();
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Twitch connection check failed";
    }
  }

  res.json({
    provider,
    channelLogin: process.env.TWITCH_CHANNEL_LOGIN?.trim() || "fenya",
    hasClientId: Boolean(process.env.TWITCH_CLIENT_ID?.trim()),
    hasClientSecret: Boolean(process.env.TWITCH_CLIENT_SECRET?.trim()),
    hasUserAccessToken: Boolean(getConfiguredUserToken()),
    hasRefreshToken: Boolean(process.env.TWITCH_REFRESH_TOKEN?.trim()),
    appTokenAvailable,
    userTokenValid: Boolean(userTokenInfo),
    userTokenScopes: userTokenInfo?.scopes ?? [],
    broadcasterId: process.env.TWITCH_BROADCASTER_ID?.trim() || null,
    lastError,
  });
}, "Failed to inspect Twitch connection"));

router.post("/fenya/poll-once", routeHandler(async (_req, res) => {
  if (getTwitchProviderName() === "mock") {
    res.json({ provider: "mock", message: "Mock mode is active; Twitch polling was skipped." });
    return;
  }
  res.json(await pollTwitchStreamOnce());
}, "Failed to poll Twitch metadata"));

router.get("/fenya/ingest/status", (_req, res) => {
  res.json(getTwitchIngestStatus());
});

router.post("/fenya/ingest/start", routeHandler(async (_req, res) => {
  res.status(202).json(await startTwitchIngest());
}, "Failed to start Twitch ingest"));

router.post("/fenya/ingest/stop", (_req, res) => {
  res.json(stopTwitchIngest());
});

export default router;
