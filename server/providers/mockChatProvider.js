const CHATTER_PROFILES = [
  { nickname: "agapuku106", note: "Часто пишет в пике" },
  { nickname: "fen_signal_042", note: "Поддерживает темп чата" },
  { nickname: "MirePilot", note: "Быстро реагирует" },
  { nickname: "acid_masha", note: "Возвращается к матчам" },
  { nickname: "BogdanVoid", note: "Следит за сериями" },
  { nickname: "SlimeOracle", note: "Активен поздним вечером" },
];

const MOCK_MESSAGES = [
  "го ещё одну",
  "хороший раунд",
  "вот это тайминг",
  "чат сегодня быстрый",
  "следующая карта будет сильной",
  "красиво сыграно",
  "ждём ещё один матч",
  "спокойно, камбэк близко",
];

const INITIAL_CHAT_ANALYTICS = {
  streamId: "2026-06-23",
  title: "Вечерний рейтинговый стрим",
  activeNow: 10,
  totalMessages: 10_435,
  activityPeak: 2.8,
  leaderboards: {
    messages: [
      { nickname: "agapuku106", value: 1_840, note: "Часто пишет в пике" },
      { nickname: "fen_signal_042", value: 1_512, note: "Поддерживает темп чата" },
      { nickname: "MirePilot", value: 1_326, note: "Быстро реагирует" },
      { nickname: "acid_masha", value: 1_170, note: "Возвращается к матчам" },
      { nickname: "BogdanVoid", value: 968, note: "Следит за сериями" },
      { nickname: "SlimeOracle", value: 902, note: "Активен поздним вечером" },
    ],
    watchTime: [
      { nickname: "agapuku106", value: "4ч 11м", note: "Смотрит почти весь стрим" },
      { nickname: "MirePilot", value: "4ч 03м", note: "Быстро реагирует" },
      { nickname: "fen_signal_042", value: "3ч 58м", note: "Стабильно остаётся в эфире" },
      { nickname: "acid_masha", value: "3ч 35м", note: "Часто возвращается" },
      { nickname: "SlimeOracle", value: "3ч 02м", note: "Активен поздним вечером" },
      { nickname: "BogdanVoid", value: "2ч 48м", note: "Следит за сериями" },
    ],
    tempo: [
      { nickname: "agapuku106", value: "x2.8", note: "Сильная активность" },
      { nickname: "fen_signal_042", value: "x2.4", note: "Поддерживает темп чата" },
      { nickname: "MirePilot", value: "x2.1", note: "Быстро реагирует" },
      { nickname: "acid_masha", value: "x1.9", note: "Активен в ключевые моменты" },
      { nickname: "BogdanVoid", value: "x1.7", note: "Ровная активность" },
      { nickname: "SlimeOracle", value: "x1.6", note: "Ускоряется к финалу" },
    ],
    engagement: [
      { nickname: "agapuku106", value: "21 очк.", note: "Часто возвращается" },
      { nickname: "MirePilot", value: "20 очк.", note: "Следит за каждым матчем" },
      { nickname: "fen_signal_042", value: "20 очк.", note: "Стабильно участвует" },
      { nickname: "acid_masha", value: "18 очк.", note: "Возвращается к обсуждениям" },
      { nickname: "SlimeOracle", value: "15 очк.", note: "Остаётся до финала" },
      { nickname: "BogdanVoid", value: "14 очк.", note: "Следит за сериями" },
    ],
  },
  recentMessages: [
    { time: "21:04", nickname: "agapuku106", text: "го ещё одну", type: "normal" },
    { time: "21:05", nickname: "fen_signal_042", text: "хороший раунд", type: "normal" },
    { time: "21:06", nickname: "MirePilot", text: "вот это тайминг", type: "normal" },
    { time: "21:07", nickname: "acid_masha", text: "следующая карта будет сильной", type: "normal" },
    { time: "21:08", nickname: "BogdanVoid", text: "спокойно, камбэк близко", type: "normal" },
    { time: "21:09", nickname: "SlimeOracle", text: "ждём ещё один матч", type: "normal" },
  ],
};

function getLocalTime() {
  return new Date().toTimeString().slice(0, 5);
}

function getNonEmptyText(value, fallback, maximumLength) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maximumLength)
    : fallback;
}

export function createMockChatMessage(overrides = {}) {
  const profile = CHATTER_PROFILES[Math.floor(Math.random() * CHATTER_PROFILES.length)];
  const text = MOCK_MESSAGES[Math.floor(Math.random() * MOCK_MESSAGES.length)];

  return {
    time: getLocalTime(),
    nickname: getNonEmptyText(overrides.nickname, profile.nickname, 32),
    text: getNonEmptyText(overrides.text, text, 180),
    type: "normal",
  };
}

export async function getCurrentChatAnalytics(channelLogin) {
  const normalizedLogin = String(channelLogin || "").trim().toLowerCase();

  if (normalizedLogin && normalizedLogin !== "fenya") {
    throw new Error(`No mock chat analytics configured for channel "${channelLogin}".`);
  }

  return {
    ...structuredClone(INITIAL_CHAT_ANALYTICS),
    updatedAt: new Date().toISOString(),
  };
}

