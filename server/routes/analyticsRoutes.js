import { Router } from "express";

import { routeHandler } from "../middleware/errorHandlers.js";
import { createAnalyticsSamplePoint } from "../services/analyticsSampleService.js";
import {
  getMockLiveSamplerStatus,
  startMockLiveSampler,
  stopMockLiveSampler,
} from "../services/mockLiveSampler.js";
import {
  appendStreamPoint,
  loadCurrentStreamAnalytics,
  resetCurrentStreamAnalytics,
} from "../storage/streamAnalyticsStore.js";

const router = Router();

router.get("/fenya/current-stream", routeHandler(async (_req, res) => {
  res.json(await loadCurrentStreamAnalytics());
}, "Failed to load stream analytics"));

router.post("/fenya/sample", routeHandler(async (req, res) => {
  const analytics = await loadCurrentStreamAnalytics();
  const point = createAnalyticsSamplePoint(analytics, req.body ?? {});
  res.json(await appendStreamPoint(point));
}, "Failed to append stream analytics sample", { typeErrorsAreBadRequests: true }));

router.post("/fenya/reset", routeHandler(async (_req, res) => {
  res.json(await resetCurrentStreamAnalytics());
}, "Failed to reset stream analytics"));

router.post("/fenya/sampler/start", routeHandler(async (_req, res) => {
  res.json(startMockLiveSampler());
}, "Failed to start mock live sampler"));

router.post("/fenya/sampler/stop", routeHandler(async (_req, res) => {
  res.json(stopMockLiveSampler());
}, "Failed to stop mock live sampler"));

router.get("/fenya/sampler/status", routeHandler(async (_req, res) => {
  res.json(await getMockLiveSamplerStatus());
}, "Failed to load mock live sampler status"));

export default router;
