import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { getCurrentModerationAnalytics } from "../providers/mockModerationProvider.js";

const dataDirectory = fileURLToPath(new URL("../data/", import.meta.url));
const moderationFilePath = join(dataDirectory, "fenya-current-moderation.json");
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const maximumModerators = 12;
const maximumEvents = 25;
const maximumTimelinePoints = 100;

let pendingWrite = Promise.resolve();

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeString(value, fallback, maximumLength) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maximumLength)
    : fallback;
}

function normalizeNumber(value, fallback, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  const number = typeof value === "string" && value.trim() ? Number(value) : value;
  return Number.isFinite(number) ? clamp(number, minimum, maximum) : fallback;
}

function normalizeInteger(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  return Math.round(normalizeNumber(value, fallback, 0, maximum));
}

function normalizeModerator(moderator) {
  const nickname = normalizeString(moderator?.nickname, "", 32);

  if (!nickname) {
    return null;
  }

  const timeouts = normalizeInteger(moderator.timeouts, 0);
  const bans = normalizeInteger(moderator.bans, 0);
  const deletedMessages = normalizeInteger(moderator.deletedMessages, 0);

  return {
    nickname,
    actions: Math.max(normalizeInteger(moderator.actions, 0), timeouts + bans + deletedMessages),
    timeouts,
    bans,
    deletedMessages,
    responseTimeSec: normalizeNumber(moderator.responseTimeSec, 10, 1, 120),
    accuracy: normalizeNumber(moderator.accuracy, 0, 0, 100),
    status: normalizeString(moderator.status, "active", 24),
  };
}

function normalizeTimelinePoint(point) {
  if (!point || typeof point !== "object" || !timePattern.test(point.time)) {
    return null;
  }

  const timeouts = normalizeInteger(point.timeouts, 0);
  const bans = normalizeInteger(point.bans, 0);
  const deletedMessages = normalizeInteger(point.deletedMessages, 0);

  return {
    time: point.time,
    actions: Math.max(normalizeInteger(point.actions, 0), timeouts + bans + deletedMessages),
    timeouts,
    bans,
    deletedMessages,
  };
}

function inferEventBreakdown(actions, type) {
  const timeoutShare = type.includes("timeout") ? 0.66 : type.includes("ban") ? 0.44 : 0.55;
  const banShare = type.includes("ban") ? 0.24 : type.includes("review") ? 0.05 : 0.08;
  const timeouts = Math.round(actions * timeoutShare);
  const bans = Math.round(actions * banShare);

  return {
    timeouts,
    bans,
    deletedMessages: Math.max(0, actions - timeouts - bans),
  };
}

function normalizeModerationEvent(event) {
  if (!event || typeof event !== "object" || !timePattern.test(event.time)) {
    return null;
  }

  const type = normalizeString(event.type, "moderation-action", 40);
  const requestedActions = normalizeInteger(event.actions, 0, 100_000);
  const inferredBreakdown = inferEventBreakdown(requestedActions, type);
  const timeouts = normalizeInteger(event.timeouts, inferredBreakdown.timeouts, 100_000);
  const bans = normalizeInteger(event.bans, inferredBreakdown.bans, 100_000);
  const deletedMessages = normalizeInteger(event.deletedMessages, inferredBreakdown.deletedMessages, 100_000);

  return {
    time: event.time,
    label: normalizeString(event.label, "Событие модерации", 120),
    type,
    actions: Math.max(requestedActions, timeouts + bans + deletedMessages),
    note: normalizeString(event.note, "Локальное демонстрационное событие", 180),
    timeouts,
    bans,
    deletedMessages,
  };
}

function normalizeSummary(summary) {
  const timeouts = normalizeInteger(summary?.timeouts, 0);
  const bans = normalizeInteger(summary?.bans, 0);
  const deletedMessages = normalizeInteger(summary?.deletedMessages, 0);

  return {
    totalActions: Math.max(normalizeInteger(summary?.totalActions, 0), timeouts + bans + deletedMessages),
    timeouts,
    bans,
    deletedMessages,
    averageResponseTimeSec: normalizeNumber(summary?.averageResponseTimeSec, 10, 1, 120),
    peakModerationMinute: timePattern.test(summary?.peakModerationMinute) ? summary.peakModerationMinute : "00:00",
  };
}

function normalizeModerationAnalytics(data) {
  if (!data || typeof data !== "object"
    || !Array.isArray(data.moderators)
    || !Array.isArray(data.timeline)
    || !Array.isArray(data.events)) {
    throw new TypeError("Moderation analytics do not match the expected normalized shape.");
  }

  const moderators = data.moderators.map(normalizeModerator).filter(Boolean).slice(0, maximumModerators);
  const timeline = data.timeline
    .map(normalizeTimelinePoint)
    .filter(Boolean)
    .sort((first, second) => first.time.localeCompare(second.time))
    .slice(-maximumTimelinePoints);
  const events = data.events.map(normalizeModerationEvent).filter(Boolean).slice(-maximumEvents);

  if (moderators.length === 0) {
    throw new TypeError("Moderation analytics must contain at least one valid moderator.");
  }

  return {
    streamId: normalizeString(data.streamId, "2026-06-23", 64),
    title: normalizeString(data.title, "Вечерний рейтинговый стрим", 160),
    updatedAt: typeof data.updatedAt === "string" && data.updatedAt ? data.updatedAt : null,
    summary: normalizeSummary(data.summary),
    moderators,
    timeline,
    events,
  };
}

async function initializeFromMock() {
  const mockAnalytics = await getCurrentModerationAnalytics("fenya");

  try {
    return await saveCurrentModerationAnalytics(mockAnalytics);
  } catch (error) {
    console.error("Failed to initialize local moderation analytics storage:", error);
    return normalizeModerationAnalytics(mockAnalytics);
  }
}

export async function loadCurrentModerationAnalytics() {
  try {
    const contents = await readFile(moderationFilePath, "utf8");
    const storedAnalytics = JSON.parse(contents);
    const analytics = normalizeModerationAnalytics(storedAnalytics);

    if (!analytics.updatedAt || JSON.stringify(analytics) !== JSON.stringify(storedAnalytics)) {
      return saveCurrentModerationAnalytics(analytics);
    }

    return analytics;
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn("Local moderation analytics are unavailable or invalid; restoring mock data:", error);
    }

    return initializeFromMock();
  }
}

export async function saveCurrentModerationAnalytics(data) {
  const analytics = {
    ...normalizeModerationAnalytics(data),
    updatedAt: new Date().toISOString(),
  };

  pendingWrite = pendingWrite
    .catch(() => undefined)
    .then(async () => {
      await mkdir(dataDirectory, { recursive: true });
      const temporaryPath = `${moderationFilePath}.${process.pid}.${Date.now()}.tmp`;

      try {
        await writeFile(temporaryPath, `${JSON.stringify(analytics, null, 2)}\n`, "utf8");
        await rename(temporaryPath, moderationFilePath);
      } catch (error) {
        await unlink(temporaryPath).catch(() => undefined);
        throw error;
      }
    });

  await pendingWrite;
  return analytics;
}

export async function appendMockModerationEvent(event) {
  const analytics = await loadCurrentModerationAnalytics();
  const normalizedEvent = normalizeModerationEvent(event);

  if (!normalizedEvent) {
    throw new TypeError("Moderation event time must use HH:mm format.");
  }

  const timeline = [...analytics.timeline];
  const existingPointIndex = timeline.findIndex((point) => point.time === normalizedEvent.time);

  if (existingPointIndex >= 0) {
    const currentPoint = timeline[existingPointIndex];
    timeline[existingPointIndex] = {
      time: currentPoint.time,
      actions: currentPoint.actions + normalizedEvent.actions,
      timeouts: currentPoint.timeouts + normalizedEvent.timeouts,
      bans: currentPoint.bans + normalizedEvent.bans,
      deletedMessages: currentPoint.deletedMessages + normalizedEvent.deletedMessages,
    };
  } else {
    timeline.push({
      time: normalizedEvent.time,
      actions: normalizedEvent.actions,
      timeouts: normalizedEvent.timeouts,
      bans: normalizedEvent.bans,
      deletedMessages: normalizedEvent.deletedMessages,
    });
  }

  timeline.sort((first, second) => first.time.localeCompare(second.time));
  const peakPoint = timeline.reduce((peak, point) => point.actions > peak.actions ? point : peak, timeline[0]);

  return saveCurrentModerationAnalytics({
    ...analytics,
    summary: {
      ...analytics.summary,
      totalActions: analytics.summary.totalActions + normalizedEvent.actions,
      timeouts: analytics.summary.timeouts + normalizedEvent.timeouts,
      bans: analytics.summary.bans + normalizedEvent.bans,
      deletedMessages: analytics.summary.deletedMessages + normalizedEvent.deletedMessages,
      peakModerationMinute: peakPoint?.time ?? analytics.summary.peakModerationMinute,
    },
    timeline,
    events: [...analytics.events, normalizedEvent].slice(-maximumEvents),
  });
}

export async function resetCurrentModerationAnalytics() {
  return saveCurrentModerationAnalytics(await getCurrentModerationAnalytics("fenya"));
}
