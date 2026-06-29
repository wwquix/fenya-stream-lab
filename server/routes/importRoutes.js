import express, { Router } from "express";

import { HttpError, routeHandler } from "../middleware/errorHandlers.js";
import { parseCsvImport } from "../services/csvImportService.js";
import {
  getImportErrors,
  getImportJob,
  importStreamEvents,
} from "../services/importService.js";

const router = Router();

router.post("/json", routeHandler(async (req, res) => {
  if (!Array.isArray(req.body)) {
    throw new HttpError(400, "JSON import body must be an array of normalized stream events.");
  }

  const records = req.body.map((payload, index) => ({ rowNumber: index + 1, payload }));
  res.status(201).json(importStreamEvents({
    format: "json",
    records,
    sourceName: req.get("x-file-name") ?? "pasted-json",
  }));
}, "Failed to import JSON events"));

router.post(
  "/csv",
  express.text({ type: ["text/csv", "text/plain", "application/csv"], limit: "2mb" }),
  routeHandler(async (req, res) => {
    let records;

    try {
      records = parseCsvImport(req.body);
    } catch (error) {
      if (error instanceof TypeError) {
        throw new HttpError(400, error.message, { cause: error });
      }
      throw error;
    }

    res.status(201).json(importStreamEvents({
      format: "csv",
      records,
      sourceName: req.get("x-file-name") ?? "uploaded-csv",
    }));
  }, "Failed to import CSV events"),
);

router.get("/:jobId", routeHandler(async (req, res) => {
  const job = getImportJob(req.params.jobId);
  if (!job) {
    throw new HttpError(404, "Import job not found");
  }
  res.json(job);
}, "Failed to load import job"));

router.get("/:jobId/errors", routeHandler(async (req, res) => {
  const job = getImportJob(req.params.jobId);
  if (!job) {
    throw new HttpError(404, "Import job not found");
  }
  res.json({ jobId: job.jobId, errors: getImportErrors(job.jobId) });
}, "Failed to load import errors"));

export default router;
