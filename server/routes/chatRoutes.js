import { Router } from "express";

import { routeHandler } from "../middleware/errorHandlers.js";
import { createMockChatMessage } from "../providers/mockChatProvider.js";
import {
  appendMockChatMessage,
  loadCurrentChatAnalytics,
  resetCurrentChatAnalytics,
} from "../storage/chatAnalyticsStore.js";

const router = Router();

router.get("/fenya/current-stream", routeHandler(async (_req, res) => {
  res.json(await loadCurrentChatAnalytics());
}, "Failed to load chat analytics"));

router.post("/fenya/sample", routeHandler(async (req, res) => {
  const message = createMockChatMessage(req.body ?? {});
  res.json(await appendMockChatMessage(message));
}, "Failed to append mock chat message"));

router.post("/fenya/reset", routeHandler(async (_req, res) => {
  res.json(await resetCurrentChatAnalytics());
}, "Failed to reset chat analytics"));

export default router;
