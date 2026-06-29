import { Router } from "express";

import { routeHandler } from "../middleware/errorHandlers.js";
import { loadTwitchChannelMetadata } from "../services/twitchMetadataService.js";

const router = Router();

router.get("/fenya", routeHandler(async (_req, res) => {
  res.json(await loadTwitchChannelMetadata());
}, "Failed to load Twitch metadata"));

export default router;
