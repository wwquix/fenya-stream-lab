import { Router } from "express";

import { HttpError, routeHandler } from "../middleware/errorHandlers.js";
import { getReplayStatus, startReplay, stopReplay, subscribeToReplay } from "../services/replayService.js";

const router = Router();

router.post("/:streamId/start", routeHandler(async (req, res) => {
  try {
    res.status(201).json(startReplay(req.params.streamId, req.body?.speed));
  } catch (error) {
    if (error.code === "REPLAY_DUPLICATE") throw new HttpError(409, error.message);
    if (error instanceof TypeError) throw new HttpError(400, error.message);
    throw error;
  }
}, "Failed to start replay"));

router.post("/:streamId/stop", routeHandler(async (req, res) => {
  res.json(stopReplay(req.params.streamId));
}, "Failed to stop replay"));

router.get("/:streamId/status", routeHandler(async (req, res) => {
  res.json(getReplayStatus(req.params.streamId));
}, "Failed to load replay status"));

router.get("/:streamId/events", (req, res) => {
  res.status(200).set({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  res.write("retry: 2000\n\n");
  const unsubscribe = subscribeToReplay(req.params.streamId, res);
  const heartbeat = setInterval(() => {
    if (!res.writableEnded && !res.destroyed) res.write(": keep-alive\n\n");
  }, 15_000);
  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
    if (!res.writableEnded) res.end();
  });
});

export default router;

