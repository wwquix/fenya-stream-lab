import { loadStreamDataset } from "../repositories/streamReportRepository.js";

function minutes(time) {
  if (!/^\d{2}:\d{2}$/.test(time ?? "")) return null;
  const [hours, mins] = time.split(":").map(Number);
  return (hours < 6 ? hours + 24 : hours) * 60 + mins;
}

function peak(items, field) {
  return items.reduce((best, item) => (item[field] > (best?.[field] ?? -1) ? item : best), null);
}

function calculateSegment(dataset) {
  const scored = dataset.segments.map((segment) => {
    const start = minutes(segment.start);
    const end = minutes(segment.end);
    const samples = dataset.viewerSamples.filter((sample) => {
      const point = minutes(sample.time);
      return point !== null && point >= start && point <= end;
    });
    const score = samples.reduce((total, sample) => total + sample.viewers / 100 + sample.messagesPerMinute, 0);
    return { ...segment, score, samples: samples.length };
  });
  return scored.sort((first, second) => second.score - first.score)[0] ?? null;
}

function moderationLoad(dataset) {
  const totals = dataset.moderationActions.reduce((result, action) => ({
    totalActions: result.totalActions + action.actions,
    timeouts: result.timeouts + action.timeouts,
    bans: result.bans + action.bans,
    deletedMessages: result.deletedMessages + action.deletedMessages,
  }), { totalActions: 0, timeouts: 0, bans: 0, deletedMessages: 0 });
  if (!totals.totalActions && dataset.stream.moderation_actions) {
    totals.totalActions = dataset.stream.moderation_actions;
  }
  const duration = Math.max(1, dataset.stream.duration_minutes ?? 1);
  const actionsPerHour = Math.round((totals.totalActions / duration) * 60);
  return { ...totals, actionsPerHour, level: actionsPerHour >= 180 ? "high" : actionsPerHour >= 60 ? "medium" : "low" };
}

function buildMoments(dataset, viewerPeak, chatPeak) {
  const moments = dataset.markers.map((marker) => ({
    time: marker.time,
    label: marker.label,
    type: marker.markerType,
    viewers: marker.viewers,
    messagesPerMinute: marker.messagesPerMinute,
  }));
  if (viewerPeak) moments.unshift({ ...viewerPeak, label: "Пиковый онлайн", type: "viewer-peak" });
  if (chatPeak) moments.unshift({ ...chatPeak, label: "Пик активности чата", type: "chat-peak" });
  return moments.filter((moment, index, all) => all.findIndex((item) => item.time === moment.time && item.type === moment.type) === index).slice(0, 10);
}

export async function generateLocalSummary(streamId) {
  const dataset = loadStreamDataset(streamId);
  if (!dataset) throw new Error(`Stream "${streamId}" was not found.`);

  const viewerPeak = peak(dataset.viewerSamples, "viewers");
  const chatPeak = peak(dataset.viewerSamples, "messagesPerMinute");
  const activeSegment = calculateSegment(dataset);
  const moderation = moderationLoad(dataset);
  const topChatters = dataset.chatters.slice(0, 10);
  const topWords = dataset.words.slice(0, 12).map(({ text, count }) => ({ text, count }));
  const notableMoments = buildMoments(dataset, viewerPeak, chatPeak);
  const suggestedClipMoments = notableMoments
    .map((moment) => ({ ...moment, score: (moment.viewers ?? 0) / 100 + (moment.messagesPerMinute ?? 0) }))
    .sort((first, second) => second.score - first.score)
    .slice(0, 5)
    .map((moment) => ({
      time: moment.time,
      label: moment.label,
      type: moment.type,
      viewers: moment.viewers,
      messagesPerMinute: moment.messagesPerMinute,
    }));
  const samples = dataset.viewerSamples;
  const averageViewers = samples.length
    ? Math.round(samples.reduce((total, sample) => total + sample.viewers, 0) / samples.length)
    : (dataset.stream.average_viewers ?? 0);
  const peakViewers = viewerPeak?.viewers ?? dataset.stream.peak_viewers ?? 0;
  const dataCompleteness = [samples.length, topChatters.length, topWords.length].filter(Boolean).length;
  const health = peakViewers > 0 && dataCompleteness >= 2 && moderation.level !== "high"
    ? "healthy"
    : dataCompleteness >= 1 ? "attention" : "insufficient-data";
  const verdicts = {
    healthy: "Сильный и устойчивый эфир",
    attention: "Стабильный эфир с зонами для улучшения",
    "insufficient-data": "Недостаточно данных для полной оценки",
  };
  const fallbackWord = { text: "нет данных", count: 1 };
  const fallbackChatter = { nickname: "нет данных", messages: 0, note: "Данные чата отсутствуют" };
  const metrics = {
    durationMinutes: Math.max(1, dataset.stream.duration_minutes ?? 1),
    averageViewers,
    peakViewers,
    totalMessages: dataset.stream.total_messages ?? dataset.chatMessages.length,
    uniqueChatters: dataset.stream.unique_chatters ?? topChatters.length,
    moderationActions: moderation.totalActions,
    timeouts: moderation.timeouts,
    bans: moderation.bans,
  };

  return {
    streamId: dataset.stream.stream_id,
    title: dataset.stream.title,
    categoryName: activeSegment?.category ?? dataset.stream.category_name ?? "Не указана",
    provider: "local",
    updatedAt: new Date().toISOString(),
    metrics,
    peakChatTime: chatPeak ? { time: chatPeak.time, messagesPerMinute: chatPeak.messagesPerMinute } : null,
    mostActiveSegment: activeSegment ? { start: activeSegment.start, end: activeSegment.end, label: activeSegment.label, category: activeSegment.category } : null,
    moderationLoad: moderation,
    notableMoments,
    suggestedClipMoments,
    finalStatus: { status: dataset.stream.status, health },
    highlights: notableMoments,
    topWords: topWords.length ? topWords : [fallbackWord],
    topChatters: topChatters.length ? topChatters : [fallbackChatter],
    insights: [
      viewerPeak ? `Пиковый онлайн — ${viewerPeak.viewers.toLocaleString("ru-RU")} зрителей в ${viewerPeak.time}.` : "Нет детальных замеров онлайна.",
      chatPeak ? `Максимальная скорость чата — ${chatPeak.messagesPerMinute.toLocaleString("ru-RU")} сообщений в минуту.` : "Нет детальных замеров скорости чата.",
      activeSegment ? `Самый активный сегмент: ${activeSegment.label} (${activeSegment.start}–${activeSegment.end}).` : "Сегменты стрима не размечены.",
      `Нагрузка модерации: ${moderation.level}, ${moderation.actionsPerHour} действий в час.`,
    ],
    verdict: verdicts[health],
  };
}
