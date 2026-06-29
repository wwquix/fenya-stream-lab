import { Router } from "express";

import { routeHandler } from "../middleware/errorHandlers.js";
import {
  buildCurrentStreamReport,
  formatCurrentStreamReportMarkdown,
} from "../services/reportService.js";

const router = Router();

const sendJsonReport = routeHandler(async (_req, res) => {
  res.json(await buildCurrentStreamReport());
}, "Failed to build stream report");

router.get("/fenya/current-stream", sendJsonReport);
router.get("/fenya/current-stream.json", sendJsonReport);

router.get("/fenya/current-stream.md", routeHandler(async (_req, res) => {
  const report = await buildCurrentStreamReport();
  res.type("text/markdown; charset=utf-8").send(formatCurrentStreamReportMarkdown(report));
}, "Failed to build Markdown stream report"));

export default router;
