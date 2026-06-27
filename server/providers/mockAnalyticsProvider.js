const FENYA_CURRENT_STREAM_ANALYTICS = {
  streamId: "2026-06-23",
  title: "Вечерний рейтинговый стрим",
  categoryName: "Counter-Strike 2",
  startedAt: "2026-06-26T18:30:00.000Z",
  points: [
    { time: "19:00", viewers: 3200, messagesPerMinute: 650 },
    { time: "19:20", viewers: 4700, messagesPerMinute: 940 },
    { time: "19:40", viewers: 6100, messagesPerMinute: 1680 },
    { time: "20:00", viewers: 7400, messagesPerMinute: 2140 },
    { time: "20:20", viewers: 14888, messagesPerMinute: 3020 },
    { time: "20:40", viewers: 11800, messagesPerMinute: 4100 },
    { time: "21:00", viewers: 12840, messagesPerMinute: 5360 },
    { time: "21:20", viewers: 10900, messagesPerMinute: 4580 },
    { time: "21:40", viewers: 9700, messagesPerMinute: 3860 },
    { time: "22:00", viewers: 10100, messagesPerMinute: 4190 },
    { time: "22:20", viewers: 8800, messagesPerMinute: 3150 },
    { time: "22:40", viewers: 7600, messagesPerMinute: 2840 },
  ],
  segments: [
    { start: "19:00", end: "19:35", label: "Общение" },
    { start: "19:35", end: "20:45", label: "CS2" },
    { start: "20:45", end: "21:20", label: "Общение" },
    { start: "21:20", end: "22:40", label: "Minecraft" },
  ],
  events: [
    {
      time: "19:46",
      label: "Первый рейтинговый матч",
      category: "CS2",
      type: "spike",
      viewers: 6100,
      messagesPerMinute: 1680,
    },
    {
      time: "20:06",
      label: "Волна модерации",
      category: "CS2",
      type: "timeout",
      viewers: 7400,
      messagesPerMinute: 2140,
    },
    {
      time: "20:48",
      label: "Клатч и всплеск чата",
      category: "CS2",
      type: "spike",
      viewers: 11800,
      messagesPerMinute: 4100,
    },
    {
      time: "21:18",
      label: "Смена категории",
      category: "Minecraft",
      type: "category-change",
      viewers: 10900,
      messagesPerMinute: 4580,
    },
    {
      time: "21:37",
      label: "Просадка зрителей",
      category: "Minecraft",
      type: "drop",
      viewers: 9700,
      messagesPerMinute: 3860,
    },
  ],
};

export async function getCurrentStreamAnalytics(channelLogin) {
  const normalizedLogin = String(channelLogin || "").trim().toLowerCase();

  if (normalizedLogin && normalizedLogin !== "fenya") {
    throw new Error(`No mock analytics configured for channel "${channelLogin}".`);
  }

  return FENYA_CURRENT_STREAM_ANALYTICS;
}
