import { Router } from "express";

import { routeHandler } from "../middleware/errorHandlers.js";
import {
  loadCurrentStreamSummary,
  regenerateCurrentStreamSummary,
  resetCurrentStreamSummary,
} from "../storage/summaryStore.js";

const router = Router();

router.get("/fenya/current-stream", routeHandler(async (_req, res) => {
  res.json(await loadCurrentStreamSummary());
}, "Failed to load stream summary"));

router.post("/fenya/regenerate", routeHandler(async (_req, res) => {
  res.json(await regenerateCurrentStreamSummary());
}, "Failed to regenerate stream summary"));

router.post("/fenya/reset", routeHandler(async (_req, res) => {
  res.json(await resetCurrentStreamSummary());
}, "Failed to reset stream summary"));

export default router;
