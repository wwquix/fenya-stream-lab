import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { getCurrentChatAnalytics } from "../providers/mockChatProvider.js";

const dataDirectory = fileURLToPath(new URL("../data/", import.meta.url));
const chatFilePath = join(dataDirectory, "fenya-current-chat.json");
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const leaderboardIds = ["messages", "watchTime", "tempo", "engagement"];
const maximumRecentMessages = 25;

let pendingWrite = Promise.resolve();

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeString(value, fallback, maximumLength) {
  return isNonEmptyString(value) ? value.trim().slice(0, maximumLength) : fallback;
}

function normalizeLeaderboardEntry(entry, leaderboardId) {
  if (!entry || typeof entry !== "object") {
    throw new TypeError("Chat leaderboard entries must be objects.");
  }

  const value = leaderboardId === "messages"
    ? Math.max(0, Math.round(Number.isFinite(entry.value) ? entry.value : 0))
    : normalizeString(entry.value, "—", 32);

  return {
    nickname: normalizeString(entry.nickname, "Viewer", 32),
    value,
    note: normalizeString(entry.note, "Участник чата", 120),
  };
}

function normalizeRecentMessage(message) {
  if (!message || typeof message !== "object") {
    throw new TypeError("Recent chat messages must be objects.");
  }

  return {
    time: timePattern.test(message.time) ? message.time : "00:00",
    nickname: normalizeString(message.nickname, "Viewer", 32),
    text: normalizeString(message.text, "Сообщение чата", 180),
    type: normalizeString(message.type, "normal", 24),
  };
}

function normalizeChatAnalytics(data) {
  if (!data || typeof data !== "object"
    || !isNonEmptyString(data.streamId)
    || !isNonEmptyString(data.title)
    || !data.leaderboards
    || typeof data.leaderboards !== "object"
    || !Array.isArray(data.recentMessages)) {
    throw new TypeError("Chat analytics do not match the expected normalized shape.");
  }

  const leaderboards = Object.fromEntries(leaderboardIds.map((leaderboardId) => {
    const entries = data.leaderboards[leaderboardId];

    if (!Array.isArray(entries) || entries.length === 0) {
      throw new TypeError(`Chat leaderboard "${leaderboardId}" must be a non-empty array.`);
    }

    return [leaderboardId, entries.slice(0, 25).map((entry) => normalizeLeaderboardEntry(entry, leaderboardId))];
  }));

  return {
    streamId: data.streamId.trim(),
    title: data.title.trim(),
    activeNow: clamp(Math.round(Number.isFinite(data.activeNow) ? data.activeNow : 0), 0, 999),
    totalMessages: Math.max(0, Math.round(Number.isFinite(data.totalMessages) ? data.totalMessages : 0)),
    activityPeak: clamp(Number.isFinite(data.activityPeak) ? data.activityPeak : 1, 1, 10),
    leaderboards,
    recentMessages: data.recentMessages.slice(-maximumRecentMessages).map(normalizeRecentMessage),
    updatedAt: isNonEmptyString(data.updatedAt) ? data.updatedAt : null,
  };
}

async function initializeFromMock() {
  const mockAnalytics = await getCurrentChatAnalytics("fenya");

  try {
    return await saveCurrentChatAnalytics(mockAnalytics);
  } catch (error) {
    console.error("Failed to initialize local chat analytics storage:", error);
    return normalizeChatAnalytics(mockAnalytics);
  }
}

export async function loadCurrentChatAnalytics() {
  try {
    const contents = await readFile(chatFilePath, "utf8");
    const storedAnalytics = JSON.parse(contents);
    const analytics = normalizeChatAnalytics(storedAnalytics);

    if (!analytics.updatedAt || JSON.stringify(analytics) !== JSON.stringify(storedAnalytics)) {
      return saveCurrentChatAnalytics(analytics);
    }

    return analytics;
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn("Local chat analytics storage is unavailable or invalid; restoring mock data:", error);
    }

    return initializeFromMock();
  }
}

export async function saveCurrentChatAnalytics(data) {
  const analytics = {
    ...normalizeChatAnalytics(data),
    updatedAt: new Date().toISOString(),
  };

  pendingWrite = pendingWrite
    .catch(() => undefined)
    .then(async () => {
      await mkdir(dataDirectory, { recursive: true });
      const temporaryPath = `${chatFilePath}.${process.pid}.${Date.now()}.tmp`;

      try {
        await writeFile(temporaryPath, `${JSON.stringify(analytics, null, 2)}\n`, "utf8");
        await rename(temporaryPath, chatFilePath);
      } catch (error) {
        await unlink(temporaryPath).catch(() => undefined);
        throw error;
      }
    });

  await pendingWrite;
  return analytics;
}

export async function appendMockChatMessage(message) {
  const analytics = await loadCurrentChatAnalytics();
  const normalizedMessage = normalizeRecentMessage(message ?? {});
  const recentMessages = [...analytics.recentMessages, normalizedMessage].slice(-maximumRecentMessages);
  const messagesLeaderboard = [...analytics.leaderboards.messages];
  const existingIndex = messagesLeaderboard.findIndex(
    (entry) => entry.nickname.toLowerCase() === normalizedMessage.nickname.toLowerCase(),
  );

  if (existingIndex >= 0) {
    messagesLeaderboard[existingIndex] = {
      ...messagesLeaderboard[existingIndex],
      value: messagesLeaderboard[existingIndex].value + 1,
    };
  } else {
    messagesLeaderboard.push({
      nickname: normalizedMessage.nickname,
      value: 1,
      note: "Новое сообщение",
    });
  }

  messagesLeaderboard.sort((first, second) => second.value - first.value);

  return saveCurrentChatAnalytics({
    ...analytics,
    activeNow: Math.max(
      analytics.activeNow,
      new Set(recentMessages.map((entry) => entry.nickname.toLowerCase())).size,
    ),
    totalMessages: analytics.totalMessages + 1,
    leaderboards: {
      ...analytics.leaderboards,
      messages: messagesLeaderboard.slice(0, 25),
    },
    recentMessages,
  });
}

export async function resetCurrentChatAnalytics() {
  const mockAnalytics = await getCurrentChatAnalytics("fenya");
  return saveCurrentChatAnalytics(mockAnalytics);
}

