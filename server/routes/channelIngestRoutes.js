import { Router } from "express";

import { requireChannelRole, requireUser } from "../middleware/authMiddleware.js";
import { routeHandler } from "../middleware/errorHandlers.js";
import {
  getChannelIngestStatus,
  startChannelIngest,
  stopChannelIngest,
} from "../services/twitchIngestPoolService.js";
import { connectMyTwitchChannel, getMyChannels } from "../services/channelOnboardingService.js";
import { findChannelById } from "../repositories/channelRepository.js";
import { getVodComparisonStats, listVodsByChannel } from "../repositories/twitchVodRepository.js";
import { toVodComparisonContract, toVodContract } from "../services/twitchVodContractService.js";
import { syncTwitchVods } from "../services/twitchVodService.js";
import { getChannelModeratorDirectory } from "../services/twitchModeratorService.js";

const router = Router();
const manageIngest = requireChannelRole(["channel_owner", "channel_admin"]);

router.post("/connect-my-channel", requireUser, routeHandler(async (req, res) => {
  res.json({ channel: connectMyTwitchChannel(req.user.id) });
}, "Failed to connect Twitch channel"));

router.get("/mine", requireUser, routeHandler(async (req, res) => {
  res.json({ channels: getMyChannels(req.user.id) });
}, "Failed to load user channels"));

router.post("/:channelId/archive/sync-vods", manageIngest, routeHandler(async (req, res) => {
  const channel = findChannelById(req.params.channelId);
  if (!channel) {
    res.status(404).json({ error: true, message: "Channel not found" });
    return;
  }
  const result = await syncTwitchVods(channel.id, channel.twitch_broadcaster_id, { limit: 50 });
  res.json({ syncedCount: result.syncedCount, vods: result.vods.map(toVodContract) });
}, "Failed to synchronize Twitch VOD archive"));

router.get("/:channelId/archive/vods", routeHandler(async (req, res) => {
  const channel = findChannelById(req.params.channelId);
  if (!channel) {
    res.status(404).json({ error: true, message: "Channel not found" });
    return;
  }
  res.json({ vods: listVodsByChannel(channel.id, req.query).map(toVodContract) });
}, "Failed to load Twitch VOD archive"));

router.get("/:channelId/archive/vods/comparison", routeHandler(async (req, res) => {
  const channel = findChannelById(req.params.channelId);
  if (!channel) {
    res.status(404).json({ error: true, message: "Channel not found" });
    return;
  }
  res.json(toVodComparisonContract(getVodComparisonStats(channel.id)));
}, "Failed to compare Twitch VOD archive"));

router.get("/:channelId/moderators", routeHandler(async (req, res) => {
  const result = await getChannelModeratorDirectory(req.params.channelId);
  if (!result) {
    res.status(404).json({ error: true, message: "Channel not found" });
    return;
  }
  res.json(result);
}, "Failed to load Twitch moderators"));

router.post("/:channelId/moderators/sync", manageIngest, routeHandler(async (req, res) => {
  const result = await getChannelModeratorDirectory(req.params.channelId, { sync: true });
  if (!result) {
    res.status(404).json({ error: true, message: "Channel not found" });
    return;
  }
  res.json(result);
}, "Failed to synchronize Twitch moderators"));

router.get("/:channelId/ingest/status", manageIngest, (req, res) => {
  res.json(getChannelIngestStatus(req.params.channelId));
});

router.post("/:channelId/ingest/start", manageIngest, routeHandler(async (req, res) => {
  res.status(202).json(await startChannelIngest(req.params.channelId));
}, "Failed to start channel ingest"));

router.post("/:channelId/ingest/stop", manageIngest, (req, res) => {
  res.json(stopChannelIngest(req.params.channelId));
});

export default router;
