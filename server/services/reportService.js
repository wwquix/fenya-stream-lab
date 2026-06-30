import { getTwitchChannelMetadata } from "../providers/mockTwitchProvider.js";
import { loadCurrentStreamAnalytics } from "../storage/streamAnalyticsStore.js";
import { loadCurrentChatAnalytics } from "../storage/chatAnalyticsStore.js";
import { loadCurrentWordAnalytics } from "../storage/wordAnalyticsStore.js";
import { loadCurrentModerationAnalytics } from "../storage/moderationAnalyticsStore.js";
import { loadStreamArchive } from "../storage/archiveStore.js";
import { loadCurrentStreamSummary } from "../storage/summaryStore.js";
import { loadStreamDataset } from "../repositories/streamReportRepository.js";
import { generateStreamSummary, getStreamSummary } from "./summaryService.js";

const unavailable = { available: false, message: "Не удалось получить данные" };

async function loadReportSource(label, loader) {
  try {
    return { available: true, data: await loader() };
  } catch (error) {
    console.warn(`Report source "${label}" is unavailable:`, error);
    return unavailable;
  }
}

function extractSource(source, project) {
  return source.available ? { available: true, ...project(source.data) } : source;
}

function formatNumber(value) {
  return Number.isFinite(value) ? value.toLocaleString("ru-RU") : "не удалось получить данные";
}

function formatDuration(minutes) {
  if (!Number.isFinite(minutes)) {
    return "не удалось получить данные";
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? `${hours} ч ${remainder} мин` : `${remainder} мин`;
}

function markdownList(items, formatter) {
  return items?.length
    ? items.map((item) => `- ${formatter(item)}`).join("\n")
    : "- Не удалось получить данные";
}

export async function buildCurrentStreamReport() {
  const [twitch, analytics, chat, words, moderation, archive, summary] = await Promise.all([
    loadReportSource("twitch", () => getTwitchChannelMetadata("fenya")),
    loadReportSource("analytics", loadCurrentStreamAnalytics),
    loadReportSource("chat", loadCurrentChatAnalytics),
    loadReportSource("words", loadCurrentWordAnalytics),
    loadReportSource("moderation", loadCurrentModerationAnalytics),
    loadReportSource("archive", loadStreamArchive),
    loadReportSource("summary", loadCurrentStreamSummary),
  ]);
  const summaryData = summary.available ? summary.data : null;
  const currentArchivedStream = archive.available
    ? archive.data.streams.find((stream) => stream.streamId === summaryData?.streamId) ?? archive.data.streams[0]
    : null;

  return {
    generatedAt: new Date().toISOString(),
    channel: extractSource(twitch, (data) => ({
      login: "fenya",
      displayName: data.displayName,
      isLive: data.isLive,
      viewerCount: data.viewerCount,
      startedAt: data.startedAt,
    })),
    stream: {
      streamId: summaryData?.streamId ?? analytics.data?.streamId ?? currentArchivedStream?.streamId ?? "unknown",
      title: summaryData?.title ?? analytics.data?.title ?? twitch.data?.streamTitle ?? "Данные эфира недоступны",
      categoryName: summaryData?.categoryName ?? analytics.data?.categoryName ?? twitch.data?.categoryName ?? "Не указана",
      date: currentArchivedStream?.date ?? summaryData?.streamId ?? null,
      status: currentArchivedStream?.status ?? (twitch.available && twitch.data.isLive ? "live" : "completed"),
    },
    summary: summary.available ? { available: true, ...summary.data } : summary,
    analytics: extractSource(analytics, (data) => ({
      points: data.points,
      segments: data.segments,
      events: data.events,
      updatedAt: data.updatedAt,
    })),
    chat: extractSource(chat, (data) => ({
      activeNow: data.activeNow,
      totalMessages: data.totalMessages,
      activityPeak: data.activityPeak,
      topChatters: data.leaderboards.messages.slice(0, 10),
      updatedAt: data.updatedAt,
    })),
    words: extractSource(words, (data) => ({
      source: data.source,
      topWords: [...data.words].sort((first, second) => second.count - first.count).slice(0, 12),
      clusters: data.clusters,
      updatedAt: data.updatedAt,
    })),
    moderation: extractSource(moderation, (data) => ({
      summary: data.summary,
      moderators: data.moderators,
      events: data.events,
      updatedAt: data.updatedAt,
    })),
    archiveContext: archive.available
      ? {
          available: true,
          totalStreams: archive.data.streams.length,
          currentStream: currentArchivedStream,
          recentStreams: archive.data.streams.slice(0, 3),
          updatedAt: archive.data.updatedAt,
        }
      : archive,
  };
}

export function formatCurrentStreamReportMarkdown(report) {
  const metrics = report.summary.available ? report.summary.metrics : {};
  const viewerHighlights = report.summary.available ? report.summary.highlights : [];
  const topChatters = report.chat.available ? report.chat.topChatters : [];
  const topWords = report.words.available ? report.words.topWords : [];
  const moderationSummary = report.moderation.available ? report.moderation.summary : null;
  const archiveStream = report.archiveContext.available ? report.archiveContext.currentStream : null;
  const verdict = report.summary.available ? report.summary.verdict : "Не удалось получить данные";

  return `# Отчёт по стриму — ${report.stream.title}

**Дата:** ${report.stream.date ?? "не указана"}  
**Статус:** ${report.stream.status === "live" ? "В эфире" : "Завершён"}  
**Категория:** ${report.stream.categoryName}  
**Сформирован:** ${report.generatedAt}

## Основные метрики

- Длительность: ${formatDuration(metrics.durationMinutes)}
- Средний онлайн: ${formatNumber(metrics.averageViewers)}
- Пиковый онлайн: ${formatNumber(metrics.peakViewers)}
- Сообщений в чате: ${formatNumber(metrics.totalMessages)}
- Уникальных участников чата: ${formatNumber(metrics.uniqueChatters)}
- Действий модерации: ${formatNumber(metrics.moderationActions)}

## Зрительские хайлайты

${markdownList(viewerHighlights, (item) => `${item.time} — ${item.label}${Number.isFinite(item.viewers) ? ` (${formatNumber(item.viewers)} зрителей)` : ""}`)}

## Чат

${markdownList(topChatters.slice(0, 5), (item) => `${item.nickname}: ${formatNumber(item.value)} сообщений`)}

## Частые слова и фразы

${markdownList(topWords.slice(0, 8), (item) => `«${item.text}» — ${formatNumber(item.count)} упоминаний`)}

## Модерация

${moderationSummary
    ? `- Всего действий: ${formatNumber(moderationSummary.totalActions)}\n- Таймаутов: ${formatNumber(moderationSummary.timeouts)}\n- Банов: ${formatNumber(moderationSummary.bans)}\n- Удалённых сообщений: ${formatNumber(moderationSummary.deletedMessages)}`
    : "- Не удалось получить данные"}

## Контекст архива

${archiveStream
    ? `${archiveStream.summary} Главный момент: ${archiveStream.topMoment}`
    : "Не удалось получить данные"}

## Итог

${verdict}
`;
}

export async function buildStreamReport(streamId) {
  const dataset = loadStreamDataset(streamId);
  if (!dataset) return null;
  const storedSummary = getStreamSummary(streamId);
  const summary = storedSummary?.provider ? storedSummary : await generateStreamSummary(streamId);

  return {
    generatedAt: new Date().toISOString(),
    provider: summary.provider ?? "local",
    stream: {
      streamId: dataset.stream.stream_id,
      title: dataset.stream.title,
      categoryName: dataset.stream.category_name,
      date: dataset.stream.stream_date,
      status: dataset.stream.status,
      source: dataset.stream.source,
    },
    summary,
    analytics: {
      viewerSamples: dataset.viewerSamples,
      segments: dataset.segments,
      notableMoments: summary.notableMoments ?? summary.highlights,
      suggestedClipMoments: summary.suggestedClipMoments ?? [],
    },
    chat: { topChatters: summary.topChatters, sampledMessages: dataset.chatMessages.length },
    words: { topWords: summary.topWords },
    moderation: summary.moderationLoad ?? { totalActions: summary.metrics.moderationActions },
  };
}

export function formatStreamReportMarkdown(report) {
  const summary = report.summary;
  return `# Отчёт по стриму — ${report.stream.title}

**Дата:** ${report.stream.date ?? "не указана"}
**Статус:** ${report.stream.status}
**Категория:** ${report.stream.categoryName ?? "не указана"}
**Сформирован локально:** ${report.generatedAt}

## Основные метрики

- Средний онлайн: ${formatNumber(summary.metrics.averageViewers)}
- Пиковый онлайн: ${formatNumber(summary.metrics.peakViewers)}
- Сообщений в чате: ${formatNumber(summary.metrics.totalMessages)}
- Уникальных участников: ${formatNumber(summary.metrics.uniqueChatters)}
- Действий модерации: ${formatNumber(summary.metrics.moderationActions)}

## Самый активный сегмент

${summary.mostActiveSegment ? `${summary.mostActiveSegment.start}–${summary.mostActiveSegment.end} — ${summary.mostActiveSegment.label}` : "Не удалось определить"}

## Топ чатеров

${markdownList(summary.topChatters.slice(0, 10), (item) => `${item.nickname}: ${formatNumber(item.messages)} сообщений`)}

## Частые слова

${markdownList(summary.topWords.slice(0, 12), (item) => `«${item.text}» — ${formatNumber(item.count)}`)}

## Заметные моменты

${markdownList(summary.notableMoments ?? summary.highlights, (item) => `${item.time} — ${item.label}`)}

## Предложенные клипы

${markdownList(summary.suggestedClipMoments, (item) => `${item.time} — ${item.label}`)}

## Нагрузка модерации

${summary.moderationLoad ? `${summary.moderationLoad.level}: ${formatNumber(summary.moderationLoad.totalActions)} действий, ${formatNumber(summary.moderationLoad.actionsPerHour)} в час.` : "Не удалось получить данные"}

## Итог

${summary.verdict}
`;
}
