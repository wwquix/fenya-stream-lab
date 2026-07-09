import dotenv from "dotenv";
import process from "node:process";

import { createApp } from "./app.js";
import { validateEnv } from "./config/validateEnv.js";
import { startMockLiveSampler, stopMockLiveSampler } from "./services/mockLiveSampler.js";
import { stopTwitchIngest } from "./services/twitchIngestService.js";
import { startConfiguredTwitchIngest } from "./services/twitchIngestAutostartService.js";
import { startTwitchTokenRefreshJob, stopTwitchTokenRefreshJob } from "./services/twitchTokenRefreshService.js";
import { stopAllIngest } from "./services/twitchIngestPoolService.js";
import { stopAllReplays } from "./services/replayService.js";
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

let shutdownStarted = false;

function shutdown(signal) {
  if (shutdownStarted) return;
  shutdownStarted = true;
  console.log(`Received ${signal}; shutting down Fenya Stream Lab backend.`);
  stopMockLiveSampler();
  stopTwitchIngest();
  stopAllIngest();
  stopAllReplays();
  stopTwitchTokenRefreshJob();
  const forceExit = setTimeout(() => process.exit(1), 8000);
  forceExit.unref();
  server.close(() => {
    closeDatabase();
    clearTimeout(forceExit);
    process.exit(0);
  });
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
