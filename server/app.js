import express from "express";
import { dirname, extname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import analyticsRoutes from "./routes/analyticsRoutes.js";
import archiveRoutes from "./routes/archiveRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import healthRoutes from "./routes/healthRoutes.js";
import importRoutes from "./routes/importRoutes.js";
import moderationRoutes from "./routes/moderationRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import replayRoutes from "./routes/replayRoutes.js";
import streamRoutes from "./routes/streamRoutes.js";
import summaryRoutes from "./routes/summaryRoutes.js";
import twitchRoutes from "./routes/twitchRoutes.js";
import wordRoutes from "./routes/wordRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import channelIngestRoutes from "./routes/channelIngestRoutes.js";
import channelDataRoutes from "./routes/channelDataRoutes.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandlers.js";
import { attachCurrentUser, requireApiMutationPermission } from "./middleware/authMiddleware.js";
import {
  blockProductionDemoWrites,
  createCorsMiddleware,
  createRateLimitMiddleware,
  isSensitiveMutation,
  securityHeaders,
} from "./middleware/httpHardening.js";

const defaultFrontendDistPath = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");

export function createApp({
  serveFrontend = process.env.NODE_ENV === "production",
  frontendDistPath = defaultFrontendDistPath,
} = {}) {
  const app = express();

  app.use(securityHeaders);
  app.use(createCorsMiddleware());
  app.use(createRateLimitMiddleware({ matcher: isSensitiveMutation }));
  app.use(express.json({ limit: "2mb" }));
  app.use(attachCurrentUser);

  app.get("/health", (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ ok: true, service: "fenya-stream-lab" });
  });

  app.use(authRoutes);
  app.use("/api", blockProductionDemoWrites);
  app.use("/api", requireApiMutationPermission);
  app.use("/api/health", healthRoutes);
  app.use("/api/channels", channelIngestRoutes);
  app.use("/api/channels", channelDataRoutes);
  app.use("/api/import", importRoutes);
  app.use("/api/twitch", twitchRoutes);
  app.use("/api/analytics", analyticsRoutes);
  app.use("/api/chat", chatRoutes);
  app.use("/api/words", wordRoutes);
  app.use("/api/moderation", moderationRoutes);
  app.use("/api/archive", archiveRoutes);
  app.use("/api/summary", summaryRoutes);
  app.use("/api/report", reportRoutes);
  app.use("/api/replay", replayRoutes);
  app.use("/api/streams", streamRoutes);

  if (serveFrontend) {
    app.use(express.static(frontendDistPath, { index: false }));
    app.use((req, res, next) => {
      const isServerRoute = req.path === "/api" || req.path.startsWith("/api/") || req.path === "/auth" || req.path.startsWith("/auth/");
      if (req.method !== "GET" || isServerRoute || extname(req.path)) {
        next();
        return;
      }
      res.sendFile(join(frontendDistPath, "index.html"), (error) => {
        if (error) next(error);
      });
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
