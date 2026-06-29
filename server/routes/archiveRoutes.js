import { Router } from "express";

import { HttpError, routeHandler } from "../middleware/errorHandlers.js";
import { createMockArchivedStream } from "../providers/mockArchiveProvider.js";
import {
  appendMockArchivedStream,
  getArchivedStreamById,
  loadStreamArchive,
  resetStreamArchive,
} from "../storage/archiveStore.js";

const router = Router();

router.get("/fenya/streams", routeHandler(async (_req, res) => {
  res.json(await loadStreamArchive());
}, "Failed to load stream archive"));

router.get("/fenya/streams/:streamId", routeHandler(async (req, res) => {
  const stream = await getArchivedStreamById(req.params.streamId);

  if (!stream) {
    throw new HttpError(404, "Archived stream not found");
  }

  res.json(stream);
}, "Failed to load archived stream"));

router.post("/fenya/sample", routeHandler(async (req, res) => {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  res.json(await appendMockArchivedStream(createMockArchivedStream(body)));
}, "Failed to append mock archived stream", { typeErrorsAreBadRequests: true }));

router.post("/fenya/reset", routeHandler(async (_req, res) => {
  res.json(await resetStreamArchive());
}, "Failed to reset stream archive"));

export default router;
