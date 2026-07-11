import dotenv from "dotenv";
import process from "node:process";

import { createApp } from "./app.js";
import { validateEnv } from "./config/validateEnv.js";
import { shutdownMockLiveSampler, startMockLiveSampler } from "./services/mockLiveSampler.js";
import { startConfiguredTwitchIngest } from "./services/twitchIngestAutostartService.js";
import { shutdownTwitchTokenRefreshJob, startTwitchTokenRefreshJob } from "./services/twitchTokenRefreshService.js";
import { shutdownAllIngest } from "./services/twitchIngestPoolService.js";
import { stopAllReplays } from "./services/replayService.js";
import { createApplicationStopServices, createShutdownHandler } from "./services/gracefulShutdownService.js";
import { closeDatabase } from "./storage/db.js";

dotenv.config();

try {
  validateEnv();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const port = process.env.PORT || 3001;
const app = createApp();

const server = app.listen(port, () => {
  console.log(`Fenya Stream Lab backend listening on http://localhost:${port}`);

  if (String(process.env.MOCK_SAMPLER_AUTOSTART).toLowerCase() === "true") {
    const samplerStatus = startMockLiveSampler();
    console.log(`Mock live sampler started with a ${samplerStatus.intervalMs}ms interval`);
  }

  startConfiguredTwitchIngest();

  const tokenRefreshStatus = startTwitchTokenRefreshJob();
  if (tokenRefreshStatus.running) {
    console.log(`Twitch token refresh job started with a ${tokenRefreshStatus.intervalMs}ms interval`);
  }
});

const shutdown = createShutdownHandler({
  server,
  stopServices: createApplicationStopServices({
    stopReplays: stopAllReplays,
    shutdownMockSampler: shutdownMockLiveSampler,
    shutdownTokenRefresh: shutdownTwitchTokenRefreshJob,
    shutdownIngest: shutdownAllIngest,
  }),
  closeDatabase,
  exit: (code) => process.exit(code),
  logger: console,
  timeoutMs: 8_000,
});

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
