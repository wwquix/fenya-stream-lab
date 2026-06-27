import process from "node:process";

import {
  appendStreamPoint,
  loadCurrentStreamAnalytics,
  STREAM_ANALYTICS_LIMITS,
} from "../storage/streamAnalyticsStore.js";

const DEFAULT_INTERVAL_MS = 10_000;
const SAFE_FALLBACK_VIEWERS = 8_000;
const SAFE_FALLBACK_MESSAGES_PER_MINUTE = 2_500;

let samplerTimer = null;
let samplerTickInProgress = false;
let activeIntervalMs = DEFAULT_INTERVAL_MS;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function getConfiguredIntervalMs() {
  const configuredInterval = Number.parseInt(process.env.MOCK_SAMPLER_INTERVAL_MS ?? "", 10);
  return Number.isFinite(configuredInterval) && configuredInterval > 0
    ? configuredInterval
    : DEFAULT_INTERVAL_MS;
}

function advanceTime(time, minutesToAdd = 1) {
  const [hours, minutes] = time.split(":").map(Number);
  const totalMinutes = (hours * 60 + minutes + minutesToAdd) % (24 * 60);

  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
}

function varyMetric(value, maximumChange, minimum, maximum) {
  const safeValue = clamp(value, minimum, maximum);
  const change = 1 + (Math.random() * 2 - 1) * maximumChange;
  return clamp(Math.round(safeValue * change), minimum, maximum);
}

function getLatestValidPoint(points) {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const point = points[index];
    const isValid = Number.isFinite(point?.viewers)
      && point.viewers >= STREAM_ANALYTICS_LIMITS.minViewers
      && point.viewers <= STREAM_ANALYTICS_LIMITS.maxViewers
      && Number.isFinite(point?.messagesPerMinute)
      && point.messagesPerMinute >= STREAM_ANALYTICS_LIMITS.minMessagesPerMinute
      && point.messagesPerMinute <= STREAM_ANALYTICS_LIMITS.maxMessagesPerMinute;

    if (isValid) {
      return point;
    }
  }

  return null;
}

async function appendMockLivePoint() {
  if (samplerTickInProgress) {
    return;
  }

  samplerTickInProgress = true;

  try {
    const analytics = await loadCurrentStreamAnalytics();
    const latestPoint = getLatestValidPoint(analytics.points) ?? {
      time: new Date().toTimeString().slice(0, 5),
      viewers: SAFE_FALLBACK_VIEWERS,
      messagesPerMinute: SAFE_FALLBACK_MESSAGES_PER_MINUTE,
    };

    await appendStreamPoint({
      time: advanceTime(latestPoint.time),
      viewers: varyMetric(
        latestPoint.viewers,
        0.04,
        STREAM_ANALYTICS_LIMITS.minViewers,
        STREAM_ANALYTICS_LIMITS.maxViewers,
      ),
      messagesPerMinute: varyMetric(
        latestPoint.messagesPerMinute,
        0.08,
        STREAM_ANALYTICS_LIMITS.minMessagesPerMinute,
        STREAM_ANALYTICS_LIMITS.maxMessagesPerMinute,
      ),
    });
  } catch (error) {
    console.error("Mock live sampler failed to append an analytics point:", error);
  } finally {
    samplerTickInProgress = false;
  }
}

export function startMockLiveSampler() {
  if (samplerTimer) {
    return {
      running: true,
      intervalMs: activeIntervalMs,
    };
  }

  activeIntervalMs = getConfiguredIntervalMs();
  samplerTimer = setInterval(appendMockLivePoint, activeIntervalMs);
  samplerTimer.unref();

  return {
    running: true,
    intervalMs: activeIntervalMs,
  };
}

export function stopMockLiveSampler() {
  if (samplerTimer) {
    clearInterval(samplerTimer);
    samplerTimer = null;
  }

  return { running: false };
}

export async function getMockLiveSamplerStatus() {
  const analytics = await loadCurrentStreamAnalytics();

  return {
    running: Boolean(samplerTimer),
    intervalMs: samplerTimer ? activeIntervalMs : getConfiguredIntervalMs(),
    pointsCount: analytics.points.length,
    updatedAt: analytics.updatedAt ?? null,
  };
}
