import { Router } from "express";

import { requireChannelRole } from "../middleware/authMiddleware.js";
import { routeHandler } from "../middleware/errorHandlers.js";
import {
  loadCurrentChatAnalyticsFromDatabase,
  loadCurrentModerationAnalyticsFromDatabase,
  loadCurrentStreamAnalyticsFromDatabase,
  loadCurrentWordAnalyticsFromDatabase,
  loadStreamArchiveFromDatabase,
} from "../repositories/dashboardRepository.js";
import { findChannelById } from "../repositories/channelRepository.js";
import { CHANNEL_ROLES } from "../repositories/membershipRepository.js";
import { getAdvancedStreamAnalytics } from "../services/advancedAnalyticsService.js";
import { loadTwitchChannelMetadata } from "../services/twitchMetadataService.js";

const router = Router();
const readChannelAnalytics = requireChannelRole(CHANNEL_ROLES);

router.get("/:channelId/twitch", routeHandler(async (req, res) => {
  const channel = findChannelById(req.params.channelId);
  if (!channel) {
    res.status(404).json({ error: true, message: "Channel not found" });
    return;
  }
  res.json(await loadTwitchChannelMetadata(channel.twitch_login));
}, "Failed to load channel Twitch metadata"));

function channelData(loader) {
  return routeHandler(async (req, res) => {
    const channel = findChannelById(req.params.channelId);
    if (!channel) {
      res.status(404).json({ error: true, message: "Channel not found" });
      return;
    }
    const data = loader("twitch", channel.id);
    if (!data) {
      res.status(204).end();
      return;
    }
    res.json(data);
  }, "Failed to load channel analytics");
}

router.get("/:channelId/analytics/current-stream", channelData(loadCurrentStreamAnalyticsFromDatabase));
router.get("/:channelId/chat/current-stream", channelData(loadCurrentChatAnalyticsFromDatabase));
router.get("/:channelId/words/current-stream", channelData(loadCurrentWordAnalyticsFromDatabase));
router.get("/:channelId/moderation/current-stream", channelData(loadCurrentModerationAnalyticsFromDatabase));
router.get("/:channelId/archive/streams", channelData(loadStreamArchiveFromDatabase));
router.get("/:channelId/streams/:streamId/advanced-analytics", readChannelAnalytics, routeHandler(async (req, res) => {
  const analytics = getAdvancedStreamAnalytics(req.params.streamId, {
    channelId: req.params.channelId,
  });
  if (!analytics) {
    res.status(404).json({ error: true, message: `Stream "${req.params.streamId}" was not found.` });
    return;
  }
  res.json(analytics);
}, "Failed to build channel advanced analytics"));

export default router;
