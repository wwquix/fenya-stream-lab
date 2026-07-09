import process from "node:process";

import { startTwitchIngest } from "./twitchIngestService.js";

export async function startConfiguredTwitchIngest({
  env = process.env,
  startIngest = startTwitchIngest,
  logger = console,
} = {}) {
  const enabled = String(env.TWITCH_PROVIDER).trim().toLowerCase() === "twitch"
    && String(env.TWITCH_LIVE_INGEST_AUTOSTART).trim().toLowerCase() === "true";

  if (!enabled) return { enabled: false, started: false };

  logger.log("Twitch live ingest autostart enabled");
  try {
    const status = await startIngest();
    logger.log(`Twitch live ingest autostarted: channel=@${status.channelLogin || "unknown"}, collectedFrom=${status.collectedFrom || "pending"}`);
    return { enabled: true, started: true, status };
  } catch {
    logger.error("Twitch live ingest autostart failed");
    return { enabled: true, started: false };
  }
}
