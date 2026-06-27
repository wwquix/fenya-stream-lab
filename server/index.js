import cors from "cors";
import dotenv from "dotenv";
import express from "express";

import { getCurrentStreamAnalytics } from "./providers/mockAnalyticsProvider.js";
import { getTwitchChannelMetadata as getMockTwitchChannelMetadata } from "./providers/mockTwitchProvider.js";
import { getTwitchChannelMetadata as getRealTwitchChannelMetadata } from "./providers/twitchProvider.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

function resolveTwitchProvider() {
  const providerName = process.env.TWITCH_PROVIDER || "mock";

  if (providerName === "mock") {
    return getMockTwitchChannelMetadata;
  }

  if (providerName === "twitch" || providerName === "real") {
    return getRealTwitchChannelMetadata;
  }

  return getMockTwitchChannelMetadata;
}

app.get("/api/twitch/fenya", async (_req, res) => {
  try {
    const channelLogin = process.env.TWITCH_CHANNEL_LOGIN || "fenya";
    const getTwitchChannelMetadata = resolveTwitchProvider();
    const metadata = await getTwitchChannelMetadata(channelLogin);

    res.json(metadata);
  } catch (error) {
    console.error("Failed to load Twitch metadata:", error);

    res.status(500).json({
      error: true,
      message: "Failed to load Twitch metadata",
    });
  }
});

app.get("/api/analytics/fenya/current-stream", async (_req, res) => {
  try {
    const channelLogin = process.env.TWITCH_CHANNEL_LOGIN || "fenya";
    const analytics = await getCurrentStreamAnalytics(channelLogin);

    res.json(analytics);
  } catch (error) {
    console.error("Failed to load stream analytics:", error);

    res.status(500).json({
      error: true,
      message: "Failed to load stream analytics",
    });
  }
});

app.listen(port, () => {
  console.log(`Fenya Stream Lab backend listening on http://localhost:${port}`);
});
