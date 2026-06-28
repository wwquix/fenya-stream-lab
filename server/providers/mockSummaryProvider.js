const INITIAL_STREAM_SUMMARY = {
  streamId: "2026-06-23",
  title: "Вечерний рейтинговый стрим",
  categoryName: "Counter-Strike 2",
  metrics: {
    durationMinutes: 260,
    averageViewers: 8420,
    peakViewers: 12840,
    totalMessages: 10435,
    uniqueChatters: 1280,
    moderationActions: 842,
    timeouts: 526,
    bans: 74,
  },
  highlights: [
    { time: "20:50", label: "Пик онлайна во время клатча", type: "viewer-peak", viewers: 12840, messagesPerMinute: 5074 },
    { time: "21:20", label: "Смена категории и новый всплеск чата", type: "category-change", viewers: 11341, messagesPerMinute: 4380 },
    { time: "21:40", label: "Стабилизация после пикового сегмента", type: "viewer-drop", viewers: 10417, messagesPerMinute: 4049 },
  ],
  topWords: [
    { text: "клатч", count: 460 },
    { text: "камбэк", count: 390 },
    { text: "жёстко", count: 360 },
    { text: "да ладно", count: 310 },
    { text: "минус два", count: 280 },
  ],
  topChatters: [
    { nickname: "agapuku106", messages: 1840, note: "Часто пишет в пике" },
    { nickname: "fen_signal_042", messages: 1512, note: "Поддерживает темп чата" },
    { nickname: "MirePilot", messages: 1326, note: "Быстро реагирует" },
  ],
  insights: [
    "Онлайн рос плавно и достиг максимума в центральном CS2-сегменте.",
    "Чат сохранял высокий темп после пика и активно реагировал на смену категории.",
    "Модерация выдержала нагрузку без заметного падения темпа обсуждения.",
  ],
  verdict: "Сильный эфир с устойчивым онлайном",
};

export async function getCurrentStreamSummary(channelLogin) {
  const normalizedLogin = String(channelLogin || "").trim().toLowerCase();

  if (normalizedLogin && normalizedLogin !== "fenya") {
    throw new Error(`No mock stream summary configured for channel "${channelLogin}".`);
  }

  return {
    ...structuredClone(INITIAL_STREAM_SUMMARY),
    updatedAt: new Date().toISOString(),
  };
}
