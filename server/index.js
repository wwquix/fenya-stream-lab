import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import process from "node:process";

import { getTwitchChannelMetadata as getMockTwitchChannelMetadata } from "./providers/mockTwitchProvider.js";
import { getTwitchChannelMetadata as getRealTwitchChannelMetadata } from "./providers/twitchProvider.js";
import {
  getMockLiveSamplerStatus,
  startMockLiveSampler,
  stopMockLiveSampler,
} from "./services/mockLiveSampler.js";
import { createMockChatMessage } from "./providers/mockChatProvider.js";
import {
  appendStreamPoint,
  loadCurrentStreamAnalytics,
  resetCurrentStreamAnalytics,
} from "./storage/streamAnalyticsStore.js";
import {
  appendMockChatMessage,
  loadCurrentChatAnalytics,
  resetCurrentChatAnalytics,
} from "./storage/chatAnalyticsStore.js";

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
    const analytics = await loadCurrentStreamAnalytics();

    res.json(analytics);
  } catch (error) {
    console.error("Failed to load stream analytics:", error);

    res.status(500).json({
      error: true,
      message: "Failed to load stream analytics",
    });
  }
});

app.get("/api/chat/fenya/current-stream", async (_req, res) => {
  try {
    res.json(await loadCurrentChatAnalytics());
  } catch (error) {
    console.error("Failed to load chat analytics:", error);
    res.status(500).json({ error: true, message: "Failed to load chat analytics" });
  }
});

app.post("/api/chat/fenya/sample", async (req, res) => {
  try {
    const message = createMockChatMessage(req.body ?? {});
    res.json(await appendMockChatMessage(message));
  } catch (error) {
    console.error("Failed to append mock chat message:", error);
    res.status(500).json({ error: true, message: "Failed to append mock chat message" });
  }
});

app.post("/api/chat/fenya/reset", async (_req, res) => {
  try {
    res.json(await resetCurrentChatAnalytics());
  } catch (error) {
    console.error("Failed to reset chat analytics:", error);
    res.status(500).json({ error: true, message: "Failed to reset chat analytics" });
  }
});

function addMinutes(time, minutesToAdd) {
  const [hours, minutes] = time.split(":").map(Number);
  const totalMinutes = (hours * 60 + minutes + minutesToAdd) % (24 * 60);
  const nextHours = Math.floor(totalMinutes / 60);
  const nextMinutes = totalMinutes % 60;

  return `${String(nextHours).padStart(2, "0")}:${String(nextMinutes).padStart(2, "0")}`;
}

function varyPositiveValue(value, maximumChange) {
  const change = 1 + (Math.random() * 2 - 1) * maximumChange;
  return Math.max(1, Math.round(value * change));
}

function getPositiveNumber(value, fieldName) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${fieldName} must be a positive number.`);
  }

  return value;
}

app.post("/api/analytics/fenya/sample", async (req, res) => {
  try {
    const analytics = await loadCurrentStreamAnalytics();
    const latestPoint = analytics.points.at(-1);
    const body = req.body ?? {};
    const point = {
      time: body.time ?? (latestPoint ? addMinutes(latestPoint.time, 5) : new Date().toTimeString().slice(0, 5)),
      viewers: body.viewers === undefined
        ? varyPositiveValue(latestPoint?.viewers ?? 3200, 0.06)
        : getPositiveNumber(body.viewers, "viewers"),
      messagesPerMinute: body.messagesPerMinute === undefined
        ? varyPositiveValue(latestPoint?.messagesPerMinute ?? 650, 0.12)
        : getPositiveNumber(body.messagesPerMinute, "messagesPerMinute"),
    };

    const updatedAnalytics = await appendStreamPoint(point);
    res.json(updatedAnalytics);
  } catch (error) {
    if (error instanceof TypeError) {
      res.status(400).json({ error: true, message: error.message });
      return;
    }

    console.error("Failed to append stream analytics sample:", error);
    res.status(500).json({ error: true, message: "Failed to append stream analytics sample" });
  }
});

app.post("/api/analytics/fenya/reset", async (_req, res) => {
  try {
    const analytics = await resetCurrentStreamAnalytics();
    res.json(analytics);
  } catch (error) {
    console.error("Failed to reset stream analytics:", error);
    res.status(500).json({ error: true, message: "Failed to reset stream analytics" });
  }
});

app.post("/api/analytics/fenya/sampler/start", (_req, res) => {
  res.json(startMockLiveSampler());
});

app.post("/api/analytics/fenya/sampler/stop", (_req, res) => {
  res.json(stopMockLiveSampler());
});

app.get("/api/analytics/fenya/sampler/status", async (_req, res) => {
  try {
    res.json(await getMockLiveSamplerStatus());
  } catch (error) {
    console.error("Failed to load mock live sampler status:", error);
    res.status(500).json({ error: true, message: "Failed to load mock live sampler status" });
  }
});

app.listen(port, () => {
  console.log(`Fenya Stream Lab backend listening on http://localhost:${port}`);

  if (String(process.env.MOCK_SAMPLER_AUTOSTART).toLowerCase() === "true") {
    const samplerStatus = startMockLiveSampler();
    console.log(`Mock live sampler started with a ${samplerStatus.intervalMs}ms interval`);
  }
});
