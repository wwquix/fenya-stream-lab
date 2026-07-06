import dotenv from "dotenv";
import process from "node:process";

import { createApp } from "./app.js";
import { startMockLiveSampler } from "./services/mockLiveSampler.js";
import { startTwitchIngest, stopTwitchIngest } from "./services/twitchIngestService.js";
import { startTwitchTokenRefreshJob, stopTwitchTokenRefreshJob } from "./services/twitchTokenRefreshService.js";
import { stopAllIngest } from "./services/twitchIngestPoolService.js";

dotenv.config();

const port = process.env.PORT || 3001;
const app = createApp();

const server = app.listen(port, () => {
  console.log(`Fenya Stream Lab backend listening on http://localhost:${port}`);

  if (String(process.env.MOCK_SAMPLER_AUTOSTART).toLowerCase() === "true") {
    const samplerStatus = startMockLiveSampler();
    console.log(`Mock live sampler started with a ${samplerStatus.intervalMs}ms interval`);
  }

  if (
    String(process.env.TWITCH_PROVIDER).toLowerCase() === "twitch"
    && String(process.env.TWITCH_LIVE_INGEST_AUTOSTART).toLowerCase() === "true"
  ) {
    startTwitchIngest()
      .then(() => console.log("Twitch live ingest started automatically"))
      .catch((error) => console.error("Twitch live ingest autostart failed:", error.message));
  }

  const tokenRefreshStatus = startTwitchTokenRefreshJob();
  if (tokenRefreshStatus.running) {
    console.log(`Twitch token refresh job started with a ${tokenRefreshStatus.intervalMs}ms interval`);
  }
});

function shutdown() {
  stopTwitchIngest();
  stopAllIngest();
  stopTwitchTokenRefreshJob();
  server.close(() => process.exit(0));
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
