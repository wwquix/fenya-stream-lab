import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { getCurrentStreamAnalytics } from "../providers/mockAnalyticsProvider.js";

const dataDirectory = fileURLToPath(new URL("../data/", import.meta.url));
const analyticsFilePath = join(dataDirectory, "fenya-current-stream.json");
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

let pendingWrite = Promise.resolve();

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasValidStoredShape(data) {
  return isNonEmptyString(data.streamId)
    && isNonEmptyString(data.title)
    && isNonEmptyString(data.categoryName)
    && isNonEmptyString(data.startedAt)
    && Array.isArray(data.points)
    && data.points.every((point) => (
      timePattern.test(point?.time)
      && Number.isFinite(point?.viewers)
      && point.viewers > 0
      && Number.isFinite(point?.messagesPerMinute)
      && point.messagesPerMinute > 0
    ))
    && Array.isArray(data.segments)
    && data.segments.every((segment) => (
      timePattern.test(segment?.start)
      && timePattern.test(segment?.end)
      && isNonEmptyString(segment?.label)
    ))
    && Array.isArray(data.events)
    && data.events.every((event) => timePattern.test(event?.time) && isNonEmptyString(event?.label));
}

function createStoredAnalytics(data) {
  if (!data || typeof data !== "object" || !hasValidStoredShape(data)) {
    throw new TypeError("Stream analytics do not match the expected normalized shape.");
  }

  return {
    streamId: data.streamId,
    title: data.title,
    categoryName: data.categoryName,
    startedAt: data.startedAt,
    points: data.points,
    segments: data.segments,
    events: data.events,
    updatedAt: new Date().toISOString(),
  };
}

function validatePoint(point) {
  if (!point || typeof point !== "object") {
    throw new TypeError("Stream point must be an object.");
  }

  if (!timePattern.test(point.time)) {
    throw new TypeError("Stream point time must use HH:mm format.");
  }

  if (!Number.isFinite(point.viewers) || point.viewers <= 0) {
    throw new TypeError("Stream point viewers must be a positive number.");
  }

  if (!Number.isFinite(point.messagesPerMinute) || point.messagesPerMinute <= 0) {
    throw new TypeError("Stream point messagesPerMinute must be a positive number.");
  }

  return {
    time: point.time,
    viewers: point.viewers,
    messagesPerMinute: point.messagesPerMinute,
  };
}

async function loadMockAnalytics() {
  const mockAnalytics = await getCurrentStreamAnalytics("fenya");
  return createStoredAnalytics(mockAnalytics);
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
    const contents = await readFile(analyticsFilePath, "utf8");
    const analytics = JSON.parse(contents);

    if (!analytics.updatedAt) {
      return saveCurrentStreamAnalytics(analytics);
    }

    createStoredAnalytics(analytics);
    return analytics;
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn("Local analytics storage is unavailable or invalid; restoring mock data:", error);
    }

    return initializeFromMock();
  }
}

export async function saveCurrentStreamAnalytics(data) {
  const analytics = createStoredAnalytics(data);

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
  return analytics;
}

export async function appendStreamPoint(point) {
  const analytics = await loadCurrentStreamAnalytics();
  const normalizedPoint = validatePoint(point);

  return saveCurrentStreamAnalytics({
    ...analytics,
    points: [...analytics.points, normalizedPoint],
  });
}

export async function resetCurrentStreamAnalytics() {
  const mockAnalytics = await getCurrentStreamAnalytics("fenya");
  return saveCurrentStreamAnalytics(mockAnalytics);
}
