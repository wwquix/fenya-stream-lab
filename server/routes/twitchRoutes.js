import process from "node:process";

import { Router } from "express";

import { routeHandler } from "../middleware/errorHandlers.js";
import {
  getTwitchIngestStatus,
  pollTwitchStreamOnce,
  startTwitchIngest,
  stopTwitchIngest,
} from "../services/twitchIngestService.js";
import { getTwitchProviderName, loadTwitchChannelMetadata } from "../services/twitchMetadataService.js";
import { findChannelByLogin, findOrCreateChannelFromBroadcaster } from "../repositories/channelRepository.js";
import { getVodComparisonStats, listVodsByChannel } from "../repositories/twitchVodRepository.js";
import { toVodComparisonContract, toVodContract } from "../services/twitchVodContractService.js";
import { syncTwitchVods } from "../services/twitchVodService.js";
import { getLegacyModeratorDirectory } from "../services/twitchModeratorService.js";
import { getConfiguredChannelConnectionStatus } from "../services/twitchConnectionStatusService.js";

const router = Router();

router.get("/fenya", routeHandler(async (_req, res) => {
  res.json(await loadTwitchChannelMetadata());
}, "Failed to load Twitch metadata"));

router.get("/fenya/connection", routeHandler(async (_req, res) => {
  res.json(await getConfiguredChannelConnectionStatus());
}, "Failed to inspect Twitch connection"));

router.post("/fenya/poll-once", routeHandler(async (_req, res) => {
  if (getTwitchProviderName() === "mock") {
    res.json({ provider: "mock", message: "Mock mode is active; Twitch polling was skipped." });
    return;
  }
  res.json(await pollTwitchStreamOnce());
}, "Failed to poll Twitch metadata"));

router.post("/fenya/archive/sync-vods", routeHandler(async (_req, res) => {
  if (getTwitchProviderName() !== "twitch") {
    res.status(409).json({ error: true, message: "Twitch VOD sync requires TWITCH_PROVIDER=twitch" });
    return;
  }
  const metadata = await loadTwitchChannelMetadata();
  if (!metadata.broadcasterId) {
    res.status(404).json({ error: true, message: "Twitch broadcaster id is missing" });
    return;
  }
  const channel = findOrCreateChannelFromBroadcaster({
    id: metadata.broadcasterId,
    login: metadata.channelLogin,
    display_name: metadata.displayName,
    profile_image_url: metadata.profileImageUrl,
  });
  const result = await syncTwitchVods(channel.id, metadata.broadcasterId, { limit: 50 });
  res.json({ syncedCount: result.syncedCount, vods: result.vods.map(toVodContract) });
}, "Failed to synchronize Twitch VOD archive"));

router.get("/fenya/archive/vods", routeHandler(async (_req, res) => {
  const channel = findChannelByLogin(process.env.TWITCH_CHANNEL_LOGIN?.trim() || "fenya");
  res.json({ vods: channel ? listVodsByChannel(channel.id, _req.query).map(toVodContract) : [] });
}, "Failed to load Twitch VOD archive"));

router.get("/fenya/archive/vods/comparison", routeHandler(async (_req, res) => {
  const channel = findChannelByLogin(process.env.TWITCH_CHANNEL_LOGIN?.trim() || "fenya");
  res.json(toVodComparisonContract(channel ? getVodComparisonStats(channel.id) : {
    total_vods: 0, total_duration_seconds: 0, average_duration_seconds: 0,
    top_vod: null, most_recent_vod: null,
  }));
}, "Failed to compare Twitch VOD archive"));

router.get("/fenya/moderators", routeHandler(async (_req, res) => {
  res.json(await getLegacyModeratorDirectory());
}, "Failed to load Twitch moderators"));

router.post("/fenya/moderators/sync", routeHandler(async (_req, res) => {
  res.json(await getLegacyModeratorDirectory({ sync: true }));
}, "Failed to synchronize Twitch moderators"));

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
