const minimumWeight = 8;
const maximumWeight = 100;

export function normalizeWordWeights(words) {
  const validWords = Array.isArray(words)
    ? words.filter((word) => word && Number.isFinite(word.count) && word.count > 0)
    : [];

  if (validWords.length === 0) {
    return [];
  }

  const counts = validWords.map((word) => word.count);
  const minimumCount = Math.min(...counts);
  const maximumCount = Math.max(...counts);
  const countRange = maximumCount - minimumCount;
  const uniqueCounts = [...new Set(counts)].sort((first, second) => first - second);
  const weightByCount = new Map();
  let previousWeight = minimumWeight - 1;

  uniqueCounts.forEach((count, index) => {
    const normalizedCount = countRange === 0 ? 1 : (count - minimumCount) / countRange;
    const smoothWeight = Math.round(minimumWeight + Math.sqrt(normalizedCount) * (maximumWeight - minimumWeight));
    const maximumAllowedWeight = maximumWeight - (uniqueCounts.length - index - 1);
    const weight = Math.min(maximumAllowedWeight, Math.max(previousWeight + 1, smoothWeight));
    weightByCount.set(count, weight);
    previousWeight = weight;
  });

  return validWords.map((word) => ({
    ...word,
    weight: weightByCount.get(word.count),
  }));
}

const INITIAL_WORD_ANALYTICS = {
  streamId: "2026-06-23",
  title: "Вечерний рейтинговый стрим",
  source: "demo",
  words: [
    { text: "клатч", count: 460, tone: "hype", category: "gameplay" },
    { text: "камбэк", count: 390, tone: "hype", category: "gameplay" },
    { text: "жёстко", count: 360, tone: "hype", category: "reaction" },
    { text: "да ладно", count: 310, tone: "funny", category: "meme" },
    { text: "минус два", count: 280, tone: "hype", category: "reaction" },
    { text: "хайлайт", count: 240, tone: "hype", category: "reaction" },
    { text: "чат", count: 220, tone: "neutral", category: "chat" },
    { text: "очередь", count: 210, tone: "neutral", category: "gameplay" },
    { text: "раунд", count: 200, tone: "neutral", category: "gameplay" },
    { text: "катка", count: 190, tone: "neutral", category: "gameplay" },
    { text: "карта", count: 180, tone: "neutral", category: "gameplay" },
    { text: "тайминг", count: 170, tone: "hype", category: "gameplay" },
    { text: "алмаз", count: 160, tone: "hype", category: "gameplay" },
    { text: "разнос", count: 150, tone: "hype", category: "reaction" },
    { text: "поздний пик", count: 140, tone: "neutral", category: "gameplay" },
    { text: "реакция", count: 130, tone: "funny", category: "reaction" },
    { text: "модеры", count: 120, tone: "neutral", category: "moderation" },
    { text: "бан", count: 110, tone: "toxic", category: "moderation" },
    { text: "красиво", count: 100, tone: "funny", category: "reaction" },
    { text: "подожди", count: 90, tone: "funny", category: "reaction" },
    { text: "без шансов", count: 85, tone: "hype", category: "meme" },
    { text: "пик онлайна", count: 80, tone: "neutral", category: "chat" },
    { text: "волна чата", count: 75, tone: "hype", category: "chat" },
    { text: "смена карты", count: 72, tone: "neutral", category: "gameplay" },
    { text: "смок", count: 70, tone: "neutral", category: "gameplay" },
    { text: "дефуз", count: 65, tone: "hype", category: "gameplay" },
    { text: "эко-раунд", count: 62, tone: "neutral", category: "gameplay" },
    { text: "ретейк", count: 58, tone: "hype", category: "gameplay" },
    { text: "флешка", count: 55, tone: "neutral", category: "gameplay" },
    { text: "плент", count: 52, tone: "neutral", category: "gameplay" },
    { text: "овертайм", count: 49, tone: "hype", category: "gameplay" },
    { text: "серия", count: 47, tone: "neutral", category: "gameplay" },
    { text: "MVP", count: 45, tone: "hype", category: "gameplay" },
    { text: "размен", count: 43, tone: "neutral", category: "gameplay" },
    { text: "прицел", count: 41, tone: "neutral", category: "gameplay" },
    { text: "мут", count: 35, tone: "neutral", category: "moderation" },
    { text: "фулл-бай", count: 33, tone: "hype", category: "gameplay" },
    { text: "таймаут", count: 25, tone: "neutral", category: "moderation" },
    { text: "таблица", count: 24, tone: "neutral", category: "gameplay" },
    { text: "респаун", count: 23, tone: "neutral", category: "gameplay" },
    { text: "пауза", count: 22, tone: "neutral", category: "reaction" },
    { text: "донат", count: 21, tone: "funny", category: "chat" },
    { text: "прогноз", count: 20, tone: "neutral", category: "chat" },
    { text: "победа", count: 19, tone: "hype", category: "reaction" },
    { text: "поражение", count: 18, tone: "neutral", category: "reaction" },
    { text: "последний раунд", count: 17, tone: "hype", category: "gameplay" },
    { text: "GG", count: 16, tone: "neutral", category: "chat" },
    { text: "следующая карта", count: 15, tone: "neutral", category: "gameplay" },
  ],
  clusters: [
    { label: "Игровые моменты", value: 53 },
    { label: "Реакции", value: 26 },
    { label: "Чат", value: 8 },
    { label: "Мемы", value: 7 },
    { label: "Модерация", value: 5 },
  ],
};

const SAMPLE_WORDS = [
  { text: "идеальный тайминг", count: 12, tone: "hype", category: "gameplay" },
  { text: "ещё раунд", count: 9, tone: "neutral", category: "chat" },
  { text: "вот это клатч", count: 15, tone: "hype", category: "reaction" },
  { text: "чат решил", count: 11, tone: "funny", category: "meme" },
  { text: "спокойно", count: 8, tone: "neutral", category: "reaction" },
];

export function createMockWordUpdate() {
  return structuredClone(SAMPLE_WORDS[Math.floor(Math.random() * SAMPLE_WORDS.length)]);
}

export async function getCurrentWordAnalytics(channelLogin) {
  const normalizedLogin = String(channelLogin || "").trim().toLowerCase();

  if (normalizedLogin && normalizedLogin !== "fenya") {
    throw new Error(`No mock word analytics configured for channel "${channelLogin}".`);
  }

  const analytics = structuredClone(INITIAL_WORD_ANALYTICS);

  return {
    ...analytics,
    words: normalizeWordWeights(analytics.words),
    updatedAt: new Date().toISOString(),
  };
}
