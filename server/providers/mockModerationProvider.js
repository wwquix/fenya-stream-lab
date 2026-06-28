const INITIAL_MODERATION_ANALYTICS = {
  streamId: "2026-06-23",
  title: "Вечерний рейтинговый стрим",
  summary: {
    totalActions: 842,
    timeouts: 526,
    bans: 74,
    deletedMessages: 242,
    averageResponseTimeSec: 8.4,
    peakModerationMinute: "20:48",
  },
  moderators: [
    { nickname: "mod_shadow", actions: 214, timeouts: 132, bans: 18, deletedMessages: 64, responseTimeSec: 6.8, accuracy: 94, status: "active" },
    { nickname: "NastiaMod", actions: 176, timeouts: 108, bans: 16, deletedMessages: 52, responseTimeSec: 7.5, accuracy: 92, status: "active" },
    { nickname: "Viktor_guard", actions: 142, timeouts: 88, bans: 12, deletedMessages: 42, responseTimeSec: 8.1, accuracy: 90, status: "active" },
    { nickname: "LenaWave", actions: 118, timeouts: 72, bans: 11, deletedMessages: 35, responseTimeSec: 9.2, accuracy: 88, status: "active" },
    { nickname: "IgorQueue", actions: 104, timeouts: 64, bans: 9, deletedMessages: 31, responseTimeSec: 10.4, accuracy: 86, status: "standby" },
    { nickname: "MilaLate", actions: 88, timeouts: 62, bans: 8, deletedMessages: 18, responseTimeSec: 11.7, accuracy: 84, status: "standby" },
  ],
  timeline: [
    { time: "19:00", actions: 24, timeouts: 15, bans: 2, deletedMessages: 7 },
    { time: "19:20", actions: 42, timeouts: 26, bans: 4, deletedMessages: 12 },
    { time: "19:40", actions: 58, timeouts: 37, bans: 5, deletedMessages: 16 },
    { time: "20:00", actions: 73, timeouts: 45, bans: 7, deletedMessages: 21 },
    { time: "20:20", actions: 96, timeouts: 61, bans: 8, deletedMessages: 27 },
    { time: "20:40", actions: 128, timeouts: 82, bans: 12, deletedMessages: 34 },
    { time: "21:00", actions: 112, timeouts: 71, bans: 10, deletedMessages: 31 },
    { time: "21:20", actions: 88, timeouts: 55, bans: 8, deletedMessages: 25 },
    { time: "21:40", actions: 74, timeouts: 46, bans: 7, deletedMessages: 21 },
    { time: "22:00", actions: 62, timeouts: 39, bans: 5, deletedMessages: 18 },
    { time: "22:20", actions: 48, timeouts: 30, bans: 4, deletedMessages: 14 },
    { time: "22:40", actions: 37, timeouts: 19, bans: 2, deletedMessages: 16 },
  ],
  events: [
    { time: "20:06", label: "Волна модерации", type: "timeout-spike", actions: 48, note: "Рост флуда после спорного момента" },
    { time: "20:48", label: "Пик нагрузки модераторов", type: "action-peak", actions: 84, note: "Команда быстро погасила всплеск сообщений" },
    { time: "21:12", label: "Серия удалений", type: "deletion-wave", actions: 53, note: "Повторяющиеся сообщения после хайлайта" },
    { time: "21:56", label: "Проверка новых аккаунтов", type: "review-wave", actions: 41, note: "Ручная проверка подозрительной активности" },
    { time: "22:28", label: "Поздняя волна таймаутов", type: "timeout-spike", actions: 29, note: "Локальный всплеск флуда перед сменой карты" },
  ],
};

const MOCK_EVENT_TEMPLATES = [
  { label: "Короткая волна таймаутов", type: "timeout-spike", actions: 18, note: "Модераторы остановили повторяющиеся сообщения" },
  { label: "Проверка спорных сообщений", type: "review-wave", actions: 14, note: "Команда вручную проверила контекст сообщений" },
  { label: "Очистка флуда", type: "deletion-wave", actions: 22, note: "Удалены повторы после игрового момента" },
  { label: "Серия блокировок", type: "ban-wave", actions: 11, note: "Заблокированы демонстрационные спам-аккаунты" },
];

const MOCK_EVENT_TIMES = ["19:18", "20:14", "20:52", "21:34", "22:26"];
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function getSafeString(value, fallback, maximumLength) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maximumLength)
    : fallback;
}

function getSafeActions(value, fallback) {
  const number = typeof value === "string" && value.trim() ? Number(value) : value;
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : fallback;
}

export function createMockModerationEvent(overrides = {}) {
  const template = MOCK_EVENT_TEMPLATES[Math.floor(Math.random() * MOCK_EVENT_TEMPLATES.length)];
  const fallbackTime = MOCK_EVENT_TIMES[Math.floor(Math.random() * MOCK_EVENT_TIMES.length)];
  const requestedTime = getSafeString(overrides.time, fallbackTime, 5);

  return {
    time: timePattern.test(requestedTime) ? requestedTime : fallbackTime,
    label: getSafeString(overrides.label, template.label, 120),
    type: getSafeString(overrides.type, template.type, 40),
    actions: getSafeActions(overrides.actions, template.actions),
    note: getSafeString(overrides.note, template.note, 180),
  };
}

export async function getCurrentModerationAnalytics(channelLogin) {
  const normalizedLogin = String(channelLogin || "").trim().toLowerCase();

  if (normalizedLogin && normalizedLogin !== "fenya") {
    throw new Error(`No mock moderation analytics configured for channel "${channelLogin}".`);
  }

  return {
    ...structuredClone(INITIAL_MODERATION_ANALYTICS),
    updatedAt: new Date().toISOString(),
  };
}
