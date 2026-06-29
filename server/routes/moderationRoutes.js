import { Router } from "express";

import { routeHandler } from "../middleware/errorHandlers.js";
import { createMockModerationEvent } from "../providers/mockModerationProvider.js";
import {
  appendMockModerationEvent,
  loadCurrentModerationAnalytics,
  resetCurrentModerationAnalytics,
} from "../storage/moderationAnalyticsStore.js";

const router = Router();

router.get("/fenya/current-stream", routeHandler(async (_req, res) => {
  res.json(await loadCurrentModerationAnalytics());
}, "Failed to load moderation analytics"));

router.post("/fenya/sample", routeHandler(async (req, res) => {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const event = createMockModerationEvent(body);
  res.json(await appendMockModerationEvent(event));
}, "Failed to append mock moderation event", { typeErrorsAreBadRequests: true }));

router.post("/fenya/reset", routeHandler(async (_req, res) => {
  res.json(await resetCurrentModerationAnalytics());
}, "Failed to reset moderation analytics"));

export default router;
