import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { getCurrentStreamAnalytics } from "../providers/mockAnalyticsProvider.js";
import {
  loadCurrentStreamAnalyticsFromDatabase,
  saveStreamAnalyticsToDatabase,
} from "../repositories/dashboardRepository.js";

const dataDirectory = fileURLToPath(new URL("../data/", import.meta.url));
const analyticsFilePath = join(dataDirectory, "fenya-current-stream.json");
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export const STREAM_ANALYTICS_LIMITS = Object.freeze({
  minViewers: 500,
  maxViewers: 20_000,
  minMessagesPerMinute: 50,
  maxMessagesPerMinute: 8_000,
});

const SAFE_FALLBACK_POINT = Object.freeze({
  viewers: 8_000,
  messagesPerMinute: 2_500,
});

let pendingWrite = Promise.resolve();

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function hasValidStoredStructure(data) {
  return isNonEmptyString(data.streamId)
    && isNonEmptyString(data.title)
    && isNonEmptyString(data.categoryName)
    && isNonEmptyString(data.startedAt)
    && Array.isArray(data.points)
    && data.points.every((point) => timePattern.test(point?.time))
    && Array.isArray(data.segments)
    && data.segments.every((segment) => (
      timePattern.test(segment?.start)
      && timePattern.test(segment?.end)
      && isNonEmptyString(segment?.label)
    ))
    && Array.isArray(data.events)
    && data.events.every((event) => timePattern.test(event?.time) && isNonEmptyString(event?.label));
}

function sanitizeStoredPoint(point, previousPoint) {
  const fallbackPoint = previousPoint ?? SAFE_FALLBACK_POINT;
  const viewers = Number.isFinite(point.viewers) && point.viewers >= 0
    ? point.viewers > STREAM_ANALYTICS_LIMITS.maxViewers
      ? fallbackPoint.viewers
      : clamp(point.viewers, STREAM_ANALYTICS_LIMITS.minViewers, STREAM_ANALYTICS_LIMITS.maxViewers)
    : fallbackPoint.viewers;
  const messagesPerMinute = Number.isFinite(point.messagesPerMinute) && point.messagesPerMinute >= 0
    ? clamp(
        point.messagesPerMinute,
        STREAM_ANALYTICS_LIMITS.minMessagesPerMinute,
        STREAM_ANALYTICS_LIMITS.maxMessagesPerMinute,
      )
    : fallbackPoint.messagesPerMinute;

  return {
    time: point.time,
    viewers,
    messagesPerMinute,
  };
}

function sanitizeEvent(event) {
  const sanitizedEvent = { ...event };

  if ("viewers" in event) {
    sanitizedEvent.viewers = Number.isFinite(event.viewers) && event.viewers >= 0
      ? clamp(event.viewers, STREAM_ANALYTICS_LIMITS.minViewers, STREAM_ANALYTICS_LIMITS.maxViewers)
      : SAFE_FALLBACK_POINT.viewers;
  }

  if ("messagesPerMinute" in event) {
    sanitizedEvent.messagesPerMinute = Number.isFinite(event.messagesPerMinute) && event.messagesPerMinute >= 0
      ? clamp(
          event.messagesPerMinute,
          STREAM_ANALYTICS_LIMITS.minMessagesPerMinute,
          STREAM_ANALYTICS_LIMITS.maxMessagesPerMinute,
        )
      : SAFE_FALLBACK_POINT.messagesPerMinute;
  }

  return sanitizedEvent;
}

function sanitizeAnalytics(data) {
  if (!data || typeof data !== "object" || !hasValidStoredStructure(data)) {
    throw new TypeError("Stream analytics do not match the expected normalized shape.");
  }

  let previousPoint = null;
  let changed = !isNonEmptyString(data.updatedAt);
  const points = data.points.map((point) => {
    const sanitizedPoint = sanitizeStoredPoint(point, previousPoint);
    previousPoint = sanitizedPoint;
    changed ||= sanitizedPoint.viewers !== point.viewers
      || sanitizedPoint.messagesPerMinute !== point.messagesPerMinute;
    return sanitizedPoint;
  });
  const events = data.events.map((event) => {
    const sanitizedEvent = sanitizeEvent(event);
    changed ||= sanitizedEvent.viewers !== event.viewers
      || sanitizedEvent.messagesPerMinute !== event.messagesPerMinute;
    return sanitizedEvent;
  });

  return {
    analytics: {
      streamId: data.streamId,
      title: data.title,
      categoryName: data.categoryName,
      startedAt: data.startedAt,
      points,
      segments: data.segments,
      events,
      updatedAt: isNonEmptyString(data.updatedAt) ? data.updatedAt : null,
    },
    changed,
  };
}

function clampPointForAppend(point, fallbackPoint) {
  if (!point || typeof point !== "object") {
    throw new TypeError("Stream point must be an object.");
  }

  if (!timePattern.test(point.time)) {
    throw new TypeError("Stream point time must use HH:mm format.");
  }

  return {
    time: point.time,
    viewers: Number.isFinite(point.viewers) && point.viewers >= 0
      ? clamp(point.viewers, STREAM_ANALYTICS_LIMITS.minViewers, STREAM_ANALYTICS_LIMITS.maxViewers)
      : fallbackPoint.viewers,
    messagesPerMinute: Number.isFinite(point.messagesPerMinute) && point.messagesPerMinute >= 0
      ? clamp(
          point.messagesPerMinute,
          STREAM_ANALYTICS_LIMITS.minMessagesPerMinute,
          STREAM_ANALYTICS_LIMITS.maxMessagesPerMinute,
        )
      : fallbackPoint.messagesPerMinute,
  };
}

async function loadMockAnalytics() {
  const mockAnalytics = await getCurrentStreamAnalytics("fenya");
  return sanitizeAnalytics(mockAnalytics).analytics;
}

async function initializeFromMock() {
  const analytics = await loadMockAnalytics();

  try {
    return await saveCurrentStreamAnalytics(analytics);
  } catch (error) {
    console.error("Failed to initialize local analytics storage:", error);
    return analytics;
  }
}

export async function loadCurrentStreamAnalytics() {
  try {
    const databaseAnalytics = loadCurrentStreamAnalyticsFromDatabase();

    if (databaseAnalytics) {
      return sanitizeAnalytics(databaseAnalytics).analytics;
    }
  } catch (error) {
    console.warn("SQLite analytics storage is unavailable; using local JSON fallback:", error);
  }

  try {
    const contents = await readFile(analyticsFilePath, "utf8");
    const storedAnalytics = JSON.parse(contents);
    const { analytics, changed } = sanitizeAnalytics(storedAnalytics);

    if (changed) {
      return saveCurrentStreamAnalytics(analytics);
    }

    return analytics;
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn("Local analytics storage is unavailable or invalid; restoring mock data:", error);
    }

    return initializeFromMock();
  }
}

export async function saveCurrentStreamAnalytics(data) {
  const { analytics: sanitizedAnalytics } = sanitizeAnalytics(data);
  const analytics = {
    ...sanitizedAnalytics,
    updatedAt: new Date().toISOString(),
  };

  pendingWrite = pendingWrite
    .catch(() => undefined)
    .then(async () => {
      await mkdir(dataDirectory, { recursive: true });

      const temporaryPath = `${analyticsFilePath}.${process.pid}.${Date.now()}.tmp`;

      try {
        await writeFile(temporaryPath, `${JSON.stringify(analytics, null, 2)}\n`, "utf8");
        await rename(temporaryPath, analyticsFilePath);
      } catch (error) {
        await unlink(temporaryPath).catch(() => undefined);
        throw error;
      }
    });

  await pendingWrite;

  try {
    saveStreamAnalyticsToDatabase(analytics);
  } catch (error) {
    console.warn("Failed to mirror stream analytics to SQLite:", error);
  }

  return analytics;
}

export async function appendStreamPoint(point) {
  const analytics = await loadCurrentStreamAnalytics();
  const fallbackPoint = analytics.points.at(-1) ?? SAFE_FALLBACK_POINT;
  const normalizedPoint = clampPointForAppend(point, fallbackPoint);

  return saveCurrentStreamAnalytics({
    ...analytics,
    points: [...analytics.points, normalizedPoint],
  });
}

export async function resetCurrentStreamAnalytics() {
  const mockAnalytics = await getCurrentStreamAnalytics("fenya");
  return saveCurrentStreamAnalytics(mockAnalytics);
}
