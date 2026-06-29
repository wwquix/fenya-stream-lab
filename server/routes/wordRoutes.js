import { Router } from "express";

import { routeHandler } from "../middleware/errorHandlers.js";
import { createMockWordUpdate } from "../providers/mockWordsProvider.js";
import {
  appendOrUpdateWord,
  loadCurrentWordAnalytics,
  resetCurrentWordAnalytics,
} from "../storage/wordAnalyticsStore.js";

const router = Router();

router.get("/fenya/current-stream", routeHandler(async (_req, res) => {
  res.json(await loadCurrentWordAnalytics());
}, "Failed to load word analytics"));

router.post("/fenya/sample", routeHandler(async (req, res) => {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const sample = createMockWordUpdate();

  for (const field of ["weight", "count", "tone", "category"]) {
    if (body[field] !== undefined) {
      sample[field] = body[field];
    }
  }

  if (typeof body.text === "string" && body.text.trim()) {
    sample.text = body.text;
  }

  res.json(await appendOrUpdateWord(sample));
}, "Failed to append mock word", { typeErrorsAreBadRequests: true }));

router.post("/fenya/reset", routeHandler(async (_req, res) => {
  res.json(await resetCurrentWordAnalytics());
}, "Failed to reset word analytics"));

export default router;
