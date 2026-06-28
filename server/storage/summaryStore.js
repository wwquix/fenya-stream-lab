import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { getCurrentStreamSummary } from "../providers/mockSummaryProvider.js";
import { loadCurrentStreamAnalytics } from "./streamAnalyticsStore.js";
import { loadCurrentChatAnalytics } from "./chatAnalyticsStore.js";
import { loadCurrentWordAnalytics } from "./wordAnalyticsStore.js";
import { loadCurrentModerationAnalytics } from "./moderationAnalyticsStore.js";
import { loadStreamArchive } from "./archiveStore.js";

const dataDirectory = fileURLToPath(new URL("../data/", import.meta.url));
const summaryFilePath = join(dataDirectory, "fenya-current-summary.json");

let pendingWrite = Promise.resolve();

function normalizeString(value, fallback, maximumLength) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maximumLength)
    : fallback;
}

function normalizeNumber(value, fallback, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  const number = typeof value === "string" && value.trim() ? Number(value) : value;
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}

function normalizeInteger(value, fallback, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  return Math.round(normalizeNumber(value, fallback, minimum, maximum));
}

function normalizeMetrics(metrics) {
  return {
    durationMinutes: normalizeInteger(metrics?.durationMinutes, 1, 1, 1_440),
    averageViewers: normalizeInteger(metrics?.averageViewers, 0),
    peakViewers: normalizeInteger(metrics?.peakViewers, 0),
    totalMessages: normalizeInteger(metrics?.totalMessages, 0),
    uniqueChatters: normalizeInteger(metrics?.uniqueChatters, 0),
    moderationActions: normalizeInteger(metrics?.moderationActions, 0),
    timeouts: normalizeInteger(metrics?.timeouts, 0),
    bans: normalizeInteger(metrics?.bans, 0),
  };
}

function normalizeHighlight(highlight) {
  if (!highlight || typeof highlight !== "object") {
    return null;
  }

  const label = normalizeString(highlight.label, "", 160);

  if (!label) {
    return null;
  }

  const normalized = {
    time: normalizeString(highlight.time, "00:00", 5),
    label,
    type: normalizeString(highlight.type, "stream-event", 40),
  };

  if (Number.isFinite(highlight.viewers)) {
    normalized.viewers = normalizeInteger(highlight.viewers, 0);
  }

  if (Number.isFinite(highlight.messagesPerMinute)) {
    normalized.messagesPerMinute = normalizeInteger(highlight.messagesPerMinute, 0);
  }

  return normalized;
}

function normalizeTopWord(word) {
  const text = normalizeString(word?.text, "", 48);
  return text ? { text, count: normalizeInteger(word.count, 1, 1) } : null;
}

function normalizeTopChatter(chatter) {
  const nickname = normalizeString(chatter?.nickname, "", 32);

  return nickname
    ? {
        nickname,
        messages: normalizeInteger(chatter.messages, 0),
        note: normalizeString(chatter.note, "Участник чата", 120),
      }
    : null;
}

function normalizeSummary(data) {
  if (!data || typeof data !== "object"
    || !Array.isArray(data.highlights)
    || !Array.isArray(data.topWords)
    || !Array.isArray(data.topChatters)
    || !Array.isArray(data.insights)) {
    throw new TypeError("Stream summary does not match the expected normalized shape.");
  }

  const topWords = data.topWords.map(normalizeTopWord).filter(Boolean).slice(0, 12);
  const topChatters = data.topChatters.map(normalizeTopChatter).filter(Boolean).slice(0, 10);
  const insights = data.insights
    .map((insight) => normalizeString(insight, "", 240))
    .filter(Boolean)
    .slice(0, 10);

  if (topWords.length === 0 || topChatters.length === 0 || insights.length === 0) {
    throw new TypeError("Stream summary must contain words, chatters, and insights.");
  }

  return {
    streamId: normalizeString(data.streamId, "2026-06-23", 64),
    title: normalizeString(data.title, "Вечерний рейтинговый стрим", 160),
    categoryName: normalizeString(data.categoryName, "Counter-Strike 2", 80),
    updatedAt: typeof data.updatedAt === "string" && data.updatedAt ? data.updatedAt : null,
    metrics: normalizeMetrics(data.metrics),
    highlights: data.highlights.map(normalizeHighlight).filter(Boolean).slice(0, 12),
    topWords,
    topChatters,
    insights,
    verdict: normalizeString(data.verdict, "Стабильный демонстрационный эфир", 180),
  };
}

async function initializeFromMock() {
  const mockSummary = await getCurrentStreamSummary("fenya");

  try {
    return await saveCurrentStreamSummary(mockSummary);
  } catch (error) {
    console.error("Failed to initialize local stream summary:", error);
    return normalizeSummary(mockSummary);
  }
}

async function loadSafely(label, loader) {
  try {
    return await loader();
  } catch (error) {
    console.warn(`Summary source "${label}" is unavailable; using mock fallback:`, error);
    return null;
  }
}

function calculateAverage(points, field) {
  const values = points.map((point) => point?.[field]).filter(Number.isFinite);
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

function createAggregatedHighlights(analytics, fallbackHighlights) {
  if (!analytics?.points?.length) {
    return fallbackHighlights;
  }

  const peakViewerPoint = analytics.points.reduce((peak, point) => point.viewers > peak.viewers ? point : peak);
  const peakChatPoint = analytics.points.reduce((peak, point) => point.messagesPerMinute > peak.messagesPerMinute ? point : peak);
  const eventHighlights = (analytics.events ?? []).slice(0, 5).map((event) => ({
    time: event.time,
    label: event.label,
    type: event.type ?? "stream-event",
    viewers: event.viewers,
    messagesPerMinute: event.messagesPerMinute,
  }));

  return [
    { time: peakViewerPoint.time, label: "Пик онлайна", type: "viewer-peak", viewers: peakViewerPoint.viewers, messagesPerMinute: peakViewerPoint.messagesPerMinute },
    { time: peakChatPoint.time, label: "Пик активности чата", type: "chat-peak", viewers: peakChatPoint.viewers, messagesPerMinute: peakChatPoint.messagesPerMinute },
    ...eventHighlights,
  ].slice(0, 8);
}

function createInsights(metrics, topWords) {
  const peakLift = metrics.averageViewers > 0
    ? Math.round(((metrics.peakViewers - metrics.averageViewers) / metrics.averageViewers) * 100)
    : 0;
  const messagesPerMinute = metrics.durationMinutes > 0
    ? Math.round(metrics.totalMessages / metrics.durationMinutes)
    : 0;

  return [
    `Пиковый онлайн был на ${Math.max(0, peakLift)}% выше среднего уровня эфира.`,
    `Чат отправлял в среднем около ${messagesPerMinute} сообщений за минуту.`,
    `Главная фраза эфира — «${topWords[0]?.text ?? "не удалось получить данные"}».`,
    `Модерация выполнила ${metrics.moderationActions.toLocaleString("ru-RU")} действий, включая ${metrics.timeouts.toLocaleString("ru-RU")} таймаутов.`,
  ];
}

export async function loadCurrentStreamSummary() {
  try {
    const contents = await readFile(summaryFilePath, "utf8");
    const storedSummary = JSON.parse(contents);
    const summary = normalizeSummary(storedSummary);

    if (!summary.updatedAt || JSON.stringify(summary) !== JSON.stringify(storedSummary)) {
      return saveCurrentStreamSummary(summary);
    }

    return summary;
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn("Local stream summary is unavailable or invalid; restoring mock data:", error);
    }

    return initializeFromMock();
  }
}

export async function saveCurrentStreamSummary(data) {
  const summary = {
    ...normalizeSummary(data),
    updatedAt: new Date().toISOString(),
  };

  pendingWrite = pendingWrite
    .catch(() => undefined)
    .then(async () => {
      await mkdir(dataDirectory, { recursive: true });
      const temporaryPath = `${summaryFilePath}.${process.pid}.${Date.now()}.tmp`;

      try {
        await writeFile(temporaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
        await rename(temporaryPath, summaryFilePath);
      } catch (error) {
        await unlink(temporaryPath).catch(() => undefined);
        throw error;
      }
    });

  await pendingWrite;
  return summary;
}

export async function regenerateCurrentStreamSummary() {
  const fallback = await getCurrentStreamSummary("fenya");
  const [analytics, chat, words, moderation, archive] = await Promise.all([
    loadSafely("analytics", loadCurrentStreamAnalytics),
    loadSafely("chat", loadCurrentChatAnalytics),
    loadSafely("words", loadCurrentWordAnalytics),
    loadSafely("moderation", loadCurrentModerationAnalytics),
    loadSafely("archive", loadStreamArchive),
  ]);
  const archiveStream = archive?.streams?.find((stream) => stream.streamId === fallback.streamId) ?? null;
  const topWords = words?.words?.length
    ? [...words.words].sort((first, second) => second.count - first.count).slice(0, 8)
        .map((word) => ({ text: word.text, count: word.count }))
    : fallback.topWords;
  const topChatters = chat?.leaderboards?.messages?.slice(0, 6).map((chatter) => ({
    nickname: chatter.nickname,
    messages: chatter.value,
    note: chatter.note,
  })) ?? fallback.topChatters;
  const averageViewers = analytics?.points?.length
    ? calculateAverage(analytics.points, "viewers")
    : fallback.metrics.averageViewers;
  const peakViewers = analytics?.points?.length
    ? Math.max(...analytics.points.map((point) => point.viewers))
    : fallback.metrics.peakViewers;
  const metrics = {
    durationMinutes: archiveStream?.durationMinutes ?? fallback.metrics.durationMinutes,
    averageViewers,
    peakViewers,
    totalMessages: chat?.totalMessages ?? fallback.metrics.totalMessages,
    uniqueChatters: archiveStream?.uniqueChatters ?? fallback.metrics.uniqueChatters,
    moderationActions: moderation?.summary?.totalActions ?? fallback.metrics.moderationActions,
    timeouts: moderation?.summary?.timeouts ?? fallback.metrics.timeouts,
    bans: moderation?.summary?.bans ?? fallback.metrics.bans,
  };

  return saveCurrentStreamSummary({
    streamId: analytics?.streamId ?? archiveStream?.streamId ?? fallback.streamId,
    title: analytics?.title ?? archiveStream?.title ?? fallback.title,
    categoryName: analytics?.categoryName ?? archiveStream?.categoryName ?? fallback.categoryName,
    metrics,
    highlights: createAggregatedHighlights(analytics, fallback.highlights),
    topWords,
    topChatters,
    insights: createInsights(metrics, topWords),
    verdict: peakViewers >= 12_000
      ? "Сильный эфир с устойчивым онлайном"
      : "Стабильный эфир с ровной активностью",
  });
}

export async function resetCurrentStreamSummary() {
  return saveCurrentStreamSummary(await getCurrentStreamSummary("fenya"));
}
