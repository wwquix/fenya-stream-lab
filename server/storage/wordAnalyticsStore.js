import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { getCurrentWordAnalytics, normalizeWordWeights } from "../providers/mockWordsProvider.js";
import {
  loadCurrentWordAnalyticsFromDatabase,
  saveWordAnalyticsToDatabase,
} from "../repositories/dashboardRepository.js";

const dataDirectory = fileURLToPath(new URL("../data/", import.meta.url));
const wordAnalyticsFilePath = join(dataDirectory, "fenya-current-words.json");
const maximumWords = 50;
const maximumTextLength = 48;
const validTones = new Set(["neutral", "hype", "toxic", "funny"]);
const validCategories = new Set(["gameplay", "chat", "reaction", "meme", "moderation"]);
const blockedDemoPhrases = new Set(["могу", "тогда", "сделать", "знаю", "нормально", "ребят"]);
const profanityPatterns = [/бля/i, /сука/i, /пизд/i, /хуй/i, /хуе/i, /[её]б/i];
const clusterLabels = {
  gameplay: "Игровые моменты",
  chat: "Чат",
  reaction: "Реакции",
  meme: "Мемы",
  moderation: "Модерация",
};

let pendingWrite = Promise.resolve();

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function cleanText(value) {
  if (typeof value !== "string") {
    return "";
  }

  const withoutControlCharacters = [...value]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127 ? " " : character;
    })
    .join("");

  return withoutControlCharacters.replace(/\s+/g, " ").trim().slice(0, maximumTextLength);
}

function normalizePositiveNumber(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  const number = typeof value === "string" && value.trim() ? Number(value) : value;
  return Number.isFinite(number) && number > 0
    ? clamp(Math.round(number), 1, maximum)
    : fallback;
}

function isBlockedDemoText(text) {
  const normalizedText = text.toLocaleLowerCase("ru-RU");
  return blockedDemoPhrases.has(normalizedText)
    || profanityPatterns.some((pattern) => pattern.test(normalizedText));
}

function normalizeWord(word, fallback = {}, blockUnsafeDemoText = false) {
  const text = cleanText(word?.text);

  if (!text || (blockUnsafeDemoText && isBlockedDemoText(text))) {
    return null;
  }

  return {
    text,
    count: normalizePositiveNumber(word.count, fallback.count ?? 1),
    tone: validTones.has(word.tone) ? word.tone : fallback.tone ?? "neutral",
    category: validCategories.has(word.category) ? word.category : fallback.category ?? "chat",
  };
}

function calculateClusters(words) {
  const totals = words.reduce((result, word) => {
    result[word.category] = (result[word.category] ?? 0) + word.count;
    return result;
  }, {});
  const totalCount = Object.values(totals).reduce((sum, count) => sum + count, 0) || 1;

  return Object.entries(totals)
    .map(([category, count]) => ({
      label: clusterLabels[category],
      value: Math.max(1, Math.round((count / totalCount) * 100)),
    }))
    .sort((first, second) => second.value - first.value);
}

function normalizeWordAnalytics(data) {
  if (!data || typeof data !== "object" || !Array.isArray(data.words)) {
    throw new TypeError("Word analytics do not match the expected normalized shape.");
  }

  const uniqueWords = new Map();
  const blockUnsafeDemoText = (cleanText(data.source) || "demo").toLocaleLowerCase("ru-RU") === "demo";

  for (const candidate of data.words) {
    const word = normalizeWord(candidate, {}, blockUnsafeDemoText);

    if (!word) {
      continue;
    }

    const key = word.text.toLocaleLowerCase("ru-RU");
    const existing = uniqueWords.get(key);
    uniqueWords.set(key, existing ? { ...existing, count: existing.count + word.count } : word);
  }

  const words = normalizeWordWeights(
    [...uniqueWords.values()]
      .sort((first, second) => second.count - first.count)
      .slice(0, maximumWords),
  );

  if (words.length === 0) {
    throw new TypeError("Word analytics must contain at least one valid word.");
  }

  return {
    streamId: cleanText(data.streamId) || "2026-06-23",
    title: cleanText(data.title) || "Вечерний рейтинговый стрим",
    source: cleanText(data.source) || "demo",
    updatedAt: typeof data.updatedAt === "string" && data.updatedAt ? data.updatedAt : null,
    words,
    clusters: calculateClusters(words),
  };
}

async function initializeFromMock() {
  const mockAnalytics = await getCurrentWordAnalytics("fenya");

  try {
    return await saveCurrentWordAnalytics(mockAnalytics);
  } catch (error) {
    console.error("Failed to initialize local word analytics storage:", error);
    return normalizeWordAnalytics(mockAnalytics);
  }
}

export async function loadCurrentWordAnalytics() {
  try {
    const databaseAnalytics = loadCurrentWordAnalyticsFromDatabase();

    if (databaseAnalytics) {
      return normalizeWordAnalytics(databaseAnalytics);
    }
  } catch (error) {
    console.warn("SQLite word storage is unavailable; using local JSON fallback:", error);
  }

  try {
    const contents = await readFile(wordAnalyticsFilePath, "utf8");
    const storedAnalytics = JSON.parse(contents);
    const analytics = normalizeWordAnalytics(storedAnalytics);

    if (!analytics.updatedAt || JSON.stringify(analytics) !== JSON.stringify(storedAnalytics)) {
      return saveCurrentWordAnalytics(analytics);
    }

    return analytics;
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn("Local word analytics storage is unavailable or invalid; restoring mock data:", error);
    }

    return initializeFromMock();
  }
}

export async function saveCurrentWordAnalytics(data) {
  const analytics = {
    ...normalizeWordAnalytics(data),
    updatedAt: new Date().toISOString(),
  };

  pendingWrite = pendingWrite
    .catch(() => undefined)
    .then(async () => {
      await mkdir(dataDirectory, { recursive: true });
      const temporaryPath = `${wordAnalyticsFilePath}.${process.pid}.${Date.now()}.tmp`;

      try {
        await writeFile(temporaryPath, `${JSON.stringify(analytics, null, 2)}\n`, "utf8");
        await rename(temporaryPath, wordAnalyticsFilePath);
      } catch (error) {
        await unlink(temporaryPath).catch(() => undefined);
        throw error;
      }
    });

  await pendingWrite;

  try {
    saveWordAnalyticsToDatabase(analytics);
  } catch (error) {
    console.warn("Failed to mirror word analytics to SQLite:", error);
  }

  return analytics;
}

export async function appendOrUpdateWord(word) {
  const analytics = await loadCurrentWordAnalytics();
  const candidateText = cleanText(word?.text);

  if (!candidateText) {
    throw new TypeError("text must be a non-empty word or phrase.");
  }

  const words = [...analytics.words];
  const existingIndex = words.findIndex((entry) => entry.text.toLocaleLowerCase("ru-RU") === candidateText.toLocaleLowerCase("ru-RU"));

  if (existingIndex >= 0) {
    const existing = words[existingIndex];
    const countIncrease = normalizePositiveNumber(word.count, Math.floor(Math.random() * 16) + 5, 100_000);
    words[existingIndex] = normalizeWord({
      ...existing,
      ...word,
      text: existing.text,
      count: existing.count + countIncrease,
    }, existing);
  } else {
    words.push(normalizeWord({
      ...word,
      text: candidateText,
      count: normalizePositiveNumber(word.count, Math.floor(Math.random() * 16) + 5, 100_000),
    }));
  }

  return saveCurrentWordAnalytics({ ...analytics, words });
}

export async function resetCurrentWordAnalytics() {
  return saveCurrentWordAnalytics(await getCurrentWordAnalytics("fenya"));
}
