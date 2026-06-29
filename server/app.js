import cors from "cors";
import express from "express";

import analyticsRoutes from "./routes/analyticsRoutes.js";
import archiveRoutes from "./routes/archiveRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import healthRoutes from "./routes/healthRoutes.js";
import moderationRoutes from "./routes/moderationRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import summaryRoutes from "./routes/summaryRoutes.js";
import twitchRoutes from "./routes/twitchRoutes.js";
import wordRoutes from "./routes/wordRoutes.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandlers.js";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use("/api/health", healthRoutes);
  app.use("/api/twitch", twitchRoutes);
  app.use("/api/analytics", analyticsRoutes);
  app.use("/api/chat", chatRoutes);
  app.use("/api/words", wordRoutes);
  app.use("/api/moderation", moderationRoutes);
  app.use("/api/archive", archiveRoutes);
  app.use("/api/summary", summaryRoutes);
  app.use("/api/report", reportRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
