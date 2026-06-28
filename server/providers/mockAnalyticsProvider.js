const startMinutes = 19 * 60;
const endMinutes = 23 * 60;
const intervalMinutes = 5;

const trendAnchors = [
  { minute: 19 * 60, viewers: 3_200, messagesPerMinute: 650 },
  { minute: 19 * 60 + 30, viewers: 4_700, messagesPerMinute: 1_050 },
  { minute: 20 * 60, viewers: 7_200, messagesPerMinute: 1_950 },
  { minute: 20 * 60 + 30, viewers: 10_400, messagesPerMinute: 3_350 },
  { minute: 20 * 60 + 50, viewers: 12_850, messagesPerMinute: 5_150 },
  { minute: 21 * 60, viewers: 12_650, messagesPerMinute: 5_000 },
  { minute: 21 * 60 + 30, viewers: 10_850, messagesPerMinute: 4_200 },
  { minute: 22 * 60, viewers: 9_650, messagesPerMinute: 3_600 },
  { minute: 22 * 60 + 30, viewers: 8_350, messagesPerMinute: 3_000 },
  { minute: 23 * 60, viewers: 7_300, messagesPerMinute: 2_450 },
];

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function formatTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function interpolateTrend(minute, metric) {
  const nextAnchorIndex = trendAnchors.findIndex((anchor) => anchor.minute >= minute);

  if (nextAnchorIndex <= 0) {
    return trendAnchors[0][metric];
  }

  const previousAnchor = trendAnchors[nextAnchorIndex - 1];
  const nextAnchor = trendAnchors[nextAnchorIndex];
  const progress = (minute - previousAnchor.minute) / (nextAnchor.minute - previousAnchor.minute);
  return previousAnchor[metric] + (nextAnchor[metric] - previousAnchor[metric]) * progress;
}

function createDensePoints() {
  const pointCount = Math.floor((endMinutes - startMinutes) / intervalMinutes) + 1;

  return Array.from({ length: pointCount }, (_, index) => {
    const minute = startMinutes + index * intervalMinutes;
    const viewerNoise = Math.sin(index * 1.31) * 95 + Math.sin(index * 0.43) * 55;
    const messageNoise = Math.sin(index * 1.07) * 65 + Math.cos(index * 0.37) * 38;

    return {
      time: formatTime(minute),
      viewers: clamp(Math.round(interpolateTrend(minute, "viewers") + viewerNoise), 500, 20_000),
      messagesPerMinute: clamp(
        Math.round(interpolateTrend(minute, "messagesPerMinute") + messageNoise),
        50,
        8_000,
      ),
    };
  });
}

function createEvent(points, time, event) {
  const point = points.find((entry) => entry.time === time);

  return {
    time,
    ...event,
    viewers: point.viewers,
    messagesPerMinute: point.messagesPerMinute,
  };
}

function createCurrentStreamAnalytics() {
  const points = createDensePoints();

  return {
    streamId: "2026-06-23",
    title: "Вечерний рейтинговый стрим",
    categoryName: "Counter-Strike 2",
    startedAt: "2026-06-26T18:30:00.000Z",
    points,
    segments: [
      { start: "19:00", end: "19:35", label: "Общение" },
      { start: "19:35", end: "20:45", label: "CS2" },
      { start: "20:45", end: "21:20", label: "Общение" },
      { start: "21:20", end: "23:00", label: "Minecraft" },
    ],
    events: [
      createEvent(points, "19:45", {
        label: "Первый рейтинговый матч",
        category: "CS2",
        type: "spike",
      }),
      createEvent(points, "20:05", {
        label: "Волна модерации",
        category: "CS2",
        type: "timeout",
      }),
      createEvent(points, "20:50", {
        label: "Клатч и всплеск чата",
        category: "CS2",
        type: "spike",
      }),
      createEvent(points, "21:20", {
        label: "Смена категории",
        category: "Minecraft",
        type: "category-change",
      }),
      createEvent(points, "21:40", {
        label: "Просадка зрителей",
        category: "Minecraft",
        type: "drop",
      }),
    ],
    updatedAt: new Date().toISOString(),
  };
}

export async function getCurrentStreamAnalytics(channelLogin) {
  const normalizedLogin = String(channelLogin || "").trim().toLowerCase();

  if (normalizedLogin && normalizedLogin !== "fenya") {
    throw new Error(`No mock analytics configured for channel "${channelLogin}".`);
  }

  return createCurrentStreamAnalytics();
}
