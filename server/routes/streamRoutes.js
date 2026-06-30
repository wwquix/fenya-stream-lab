import { Router } from "express";

import { HttpError, routeHandler } from "../middleware/errorHandlers.js";
import { buildStreamReport, formatStreamReportMarkdown } from "../services/reportService.js";
import { generateStreamSummary, getStreamSummary } from "../services/summaryService.js";

const router = Router();

router.post("/:streamId/summary/generate", routeHandler(async (req, res) => {
  try {
    res.status(201).json(await generateStreamSummary(req.params.streamId));
  } catch (error) {
    if (/was not found/.test(error.message)) throw new HttpError(404, error.message);
    throw error;
  }
}, "Failed to generate stream summary"));

router.get("/:streamId/summary", routeHandler(async (req, res) => {
  const summary = getStreamSummary(req.params.streamId);
  if (!summary) throw new HttpError(404, "A summary has not been generated for this stream.");
  res.json(summary);
}, "Failed to load stream summary"));

router.get("/:streamId/report/json", routeHandler(async (req, res) => {
  const report = await buildStreamReport(req.params.streamId);
  if (!report) throw new HttpError(404, `Stream "${req.params.streamId}" was not found.`);
  res.json(report);
}, "Failed to build stream report"));

router.get("/:streamId/report/markdown", routeHandler(async (req, res) => {
  const report = await buildStreamReport(req.params.streamId);
  if (!report) throw new HttpError(404, `Stream "${req.params.streamId}" was not found.`);
  res.type("text/markdown; charset=utf-8").send(formatStreamReportMarkdown(report));
}, "Failed to build Markdown stream report"));

export default router;

