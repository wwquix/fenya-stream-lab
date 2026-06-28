const INITIAL_ARCHIVE = {
  channelLogin: "fenya",
  streams: [
    {
      streamId: "2026-06-23",
      date: "2026-06-23",
      title: "Вечерний рейтинговый стрим",
      categoryName: "Counter-Strike 2",
      startedAt: "2026-06-23T18:30:00.000Z",
      endedAt: "2026-06-23T22:50:00.000Z",
      durationMinutes: 260,
      averageViewers: 8420,
      peakViewers: 12840,
      totalMessages: 10435,
      uniqueChatters: 1280,
      moderationActions: 842,
      topWords: ["клатч", "камбэк", "жёстко"],
      topMoment: "Пик онлайна во время клатча на 20:48",
      summary: "Стрим с плавным ростом онлайна, сильным пиком в CS2 и активным чатом.",
      status: "completed",
    },
    {
      streamId: "2026-06-19",
      date: "2026-06-19",
      title: "Разбор очереди сообщества",
      categoryName: "Minecraft / Общение",
      startedAt: "2026-06-19T18:50:00.000Z",
      endedAt: "2026-06-19T22:32:00.000Z",
      durationMinutes: 222,
      averageViewers: 6780,
      peakViewers: 9840,
      totalMessages: 13910,
      uniqueChatters: 1742,
      moderationActions: 121,
      topWords: ["очередь", "постройка", "голосование"],
      topMoment: "Пик голосования сообщества на 20:10",
      summary: "Спокойная смешанная сессия с разбором построек и активным голосованием зрителей.",
      status: "completed",
    },
    {
      streamId: "2026-06-14",
      date: "2026-06-14",
      title: "Ночь рейтинговых матчей",
      categoryName: "Counter-Strike 2",
      startedAt: "2026-06-14T18:20:00.000Z",
      endedAt: "2026-06-14T23:26:00.000Z",
      durationMinutes: 306,
      averageViewers: 10240,
      peakViewers: 14620,
      totalMessages: 27300,
      uniqueChatters: 2861,
      moderationActions: 944,
      topWords: ["овертайм", "разнос", "тайминг"],
      topMoment: "Пиковый клатч в овертайме на 20:50",
      summary: "Интенсивная CS2-сессия с высоким онлайном, овертаймами и заметной нагрузкой на модерацию.",
      status: "completed",
    },
    {
      streamId: "2026-06-07",
      date: "2026-06-07",
      title: "Поздние хайлайты и реакции",
      categoryName: "Общение / Minecraft",
      startedAt: "2026-06-07T22:00:00.000Z",
      endedAt: "2026-06-08T00:58:00.000Z",
      durationMinutes: 178,
      averageViewers: 5210,
      peakViewers: 7420,
      totalMessages: 8140,
      uniqueChatters: 1082,
      moderationActions: 78,
      topWords: ["хайлайт", "реакция", "красиво"],
      topMoment: "Лучший клип вечера на 23:15",
      summary: "Короткий поздний стрим с реакциями на клипы и спокойным финалом в Minecraft.",
      status: "completed",
    },
    {
      streamId: "2026-06-03",
      date: "2026-06-03",
      title: "Большая стройка сообщества",
      categoryName: "Minecraft",
      startedAt: "2026-06-03T18:10:00.000Z",
      endedAt: "2026-06-03T22:05:00.000Z",
      durationMinutes: 235,
      averageViewers: 7340,
      peakViewers: 11120,
      totalMessages: 16820,
      uniqueChatters: 1960,
      moderationActions: 315,
      topWords: ["стройка", "ресурсы", "портал"],
      topMoment: "Открытие общего портала на 20:36",
      summary: "Ровная Minecraft-сессия с большой стройкой, совместными решениями и устойчивым онлайном.",
      status: "completed",
    },
    {
      streamId: "2026-05-29",
      date: "2026-05-29",
      title: "Разговорный вечер с чатом",
      categoryName: "Общение",
      startedAt: "2026-05-29T19:00:00.000Z",
      endedAt: "2026-05-29T21:45:00.000Z",
      durationMinutes: 165,
      averageViewers: 4630,
      peakViewers: 6890,
      totalMessages: 12840,
      uniqueChatters: 1435,
      moderationActions: 162,
      topWords: ["чат", "история", "вопрос"],
      topMoment: "Большая серия вопросов на 20:12",
      summary: "Разговорный эфир с вопросами зрителей, историями и плавным ростом активности чата.",
      status: "completed",
    },
    {
      streamId: "2026-05-25",
      date: "2026-05-25",
      title: "Марафон: матчи и выживание",
      categoryName: "Counter-Strike 2 / Minecraft",
      startedAt: "2026-05-25T17:30:00.000Z",
      endedAt: "2026-05-25T23:18:00.000Z",
      durationMinutes: 348,
      averageViewers: 9180,
      peakViewers: 15480,
      totalMessages: 24600,
      uniqueChatters: 3100,
      moderationActions: 1105,
      topWords: ["марафон", "камбэк", "смена карты"],
      topMoment: "Резкий рост онлайна после смены категории на 21:04",
      summary: "Длинный смешанный марафон с сильной серией матчей и поздним сегментом выживания.",
      status: "completed",
    },
    {
      streamId: "2026-05-18",
      date: "2026-05-18",
      title: "Калибровка и путь к алмазу",
      categoryName: "Counter-Strike 2",
      startedAt: "2026-05-18T18:40:00.000Z",
      endedAt: "2026-05-18T23:14:00.000Z",
      durationMinutes: 274,
      averageViewers: 8150,
      peakViewers: 13260,
      totalMessages: 19840,
      uniqueChatters: 2450,
      moderationActions: 688,
      topWords: ["алмаз", "калибровка", "раунд"],
      topMoment: "Решающая победа в калибровке на 22:08",
      summary: "Соревновательный стрим с серией рейтинговых матчей и сильным финальным отрезком.",
      status: "completed",
    },
    {
      streamId: "2026-05-11",
      date: "2026-05-11",
      title: "Исследование нового мира",
      categoryName: "Minecraft",
      startedAt: "2026-05-11T18:25:00.000Z",
      endedAt: "2026-05-11T21:46:00.000Z",
      durationMinutes: 201,
      averageViewers: 5960,
      peakViewers: 9040,
      totalMessages: 11280,
      uniqueChatters: 1530,
      moderationActions: 204,
      topWords: ["биом", "шахта", "деревня"],
      topMoment: "Редкая находка в новом биоме на 20:24",
      summary: "Исследовательская Minecraft-сессия с открытиями, спокойным темпом и стабильным чатом.",
      status: "completed",
    },
    {
      streamId: "2026-05-04",
      date: "2026-05-04",
      title: "Большой вечер сообщества",
      categoryName: "Общение / Counter-Strike 2",
      startedAt: "2026-05-04T17:45:00.000Z",
      endedAt: "2026-05-05T00:10:00.000Z",
      durationMinutes: 385,
      averageViewers: 10720,
      peakViewers: 17860,
      totalMessages: 29420,
      uniqueChatters: 3440,
      moderationActions: 1370,
      topWords: ["сообщество", "клатч", "финал"],
      topMoment: "Финальный матч сообщества на 22:42",
      summary: "Самая крупная сессия месяца с разговорным стартом, матчами сообщества и высоким пиком.",
      status: "completed",
    },
  ],
};

const SAMPLE_TEMPLATES = [
  { title: "Вечер быстрых матчей", categoryName: "Counter-Strike 2", topWords: ["клатч", "смок", "ретейк"], summary: "Компактная серия матчей с ровным онлайном и активным обсуждением раундов." },
  { title: "Новая глава выживания", categoryName: "Minecraft", topWords: ["шахта", "ресурсы", "портал"], summary: "Спокойная сессия выживания с исследованием мира и совместными решениями чата." },
  { title: "Вопросы, истории и один матч", categoryName: "Общение / Counter-Strike 2", topWords: ["чат", "история", "раунд"], summary: "Смешанный эфир с разговорным стартом и коротким соревновательным финалом." },
];

const SAMPLE_DATES = ["2026-06-26", "2026-06-21", "2026-06-16", "2026-06-10"];
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value) {
  if (!datePattern.test(value)) {
    return false;
  }

  const parsedDate = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === value;
}

function getSafeString(value, fallback, maximumLength) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maximumLength)
    : fallback;
}

function getSafeInteger(value, fallback, minimum, maximum) {
  const number = typeof value === "string" && value.trim() ? Number(value) : value;
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, Math.round(number))) : fallback;
}

function addMinutes(isoDate, minutes) {
  return new Date(new Date(isoDate).getTime() + minutes * 60_000).toISOString();
}

export function createMockArchivedStream(overrides = {}) {
  const template = SAMPLE_TEMPLATES[Math.floor(Math.random() * SAMPLE_TEMPLATES.length)];
  const fallbackDate = SAMPLE_DATES[Math.floor(Math.random() * SAMPLE_DATES.length)];
  const requestedDate = getSafeString(overrides.date, fallbackDate, 10);
  const date = isValidDate(requestedDate) ? requestedDate : fallbackDate;
  const durationMinutes = getSafeInteger(overrides.durationMinutes, 180 + Math.floor(Math.random() * 121), 1, 1_440);
  const averageViewers = getSafeInteger(overrides.averageViewers, 4_500 + Math.floor(Math.random() * 4_501), 0, 10_000_000);
  const startedAt = `${date}T18:30:00.000Z`;
  const topWords = Array.isArray(overrides.topWords)
    ? overrides.topWords.filter((word) => typeof word === "string" && word.trim()).slice(0, 5).map((word) => word.trim().slice(0, 32))
    : template.topWords;

  return {
    streamId: date,
    date,
    title: getSafeString(overrides.title, template.title, 160),
    categoryName: getSafeString(overrides.categoryName, template.categoryName, 80),
    startedAt,
    endedAt: addMinutes(startedAt, durationMinutes),
    durationMinutes,
    averageViewers,
    peakViewers: getSafeInteger(overrides.peakViewers, Math.round(averageViewers * 1.45), averageViewers, 20_000_000),
    totalMessages: getSafeInteger(overrides.totalMessages, 7_000 + Math.floor(Math.random() * 12_001), 0, 100_000_000),
    uniqueChatters: getSafeInteger(overrides.uniqueChatters, 800 + Math.floor(Math.random() * 1_801), 0, 10_000_000),
    moderationActions: getSafeInteger(overrides.moderationActions, 100 + Math.floor(Math.random() * 501), 0, 10_000_000),
    topWords: topWords.length ? topWords : template.topWords,
    topMoment: getSafeString(overrides.topMoment, "Пиковый момент ближе к середине эфира", 180),
    summary: getSafeString(overrides.summary, template.summary, 240),
    status: getSafeString(overrides.status, "completed", 24),
  };
}

export async function getStreamArchive(channelLogin) {
  const normalizedLogin = String(channelLogin || "").trim().toLowerCase();

  if (normalizedLogin && normalizedLogin !== "fenya") {
    throw new Error(`No mock stream archive configured for channel "${channelLogin}".`);
  }

  return {
    ...structuredClone(INITIAL_ARCHIVE),
    updatedAt: new Date().toISOString(),
  };
}
