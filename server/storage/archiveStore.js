import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { getStreamArchive } from "../providers/mockArchiveProvider.js";

const dataDirectory = fileURLToPath(new URL("../data/", import.meta.url));
const archiveFilePath = join(dataDirectory, "fenya-archive.json");
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const maximumStreams = 50;

let pendingWrite = Promise.resolve();

function normalizeString(value, fallback, maximumLength) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maximumLength)
    : fallback;
}

function normalizeInteger(value, fallback, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  const number = typeof value === "string" && value.trim() ? Number(value) : value;
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, Math.round(number))) : fallback;
}

function isValidDate(value) {
  if (!datePattern.test(value)) {
    return false;
  }

  const parsedDate = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === value;
}

function normalizeIsoDate(value, fallback) {
  return typeof value === "string" && !Number.isNaN(new Date(value).getTime())
    ? new Date(value).toISOString()
    : fallback;
}

function normalizeArchivedStream(stream) {
  if (!stream || typeof stream !== "object") {
    return null;
  }

  const date = normalizeString(stream.date, "", 10);
  const streamId = normalizeString(stream.streamId, date, 80);
  const title = normalizeString(stream.title, "", 160);
  const categoryName = normalizeString(stream.categoryName, "", 80);

  if (!isValidDate(date) || !streamId || !title || !categoryName) {
    return null;
  }

  const durationMinutes = normalizeInteger(stream.durationMinutes, 1, 1, 1_440);
  const startedAtFallback = `${date}T18:30:00.000Z`;
  const startedAt = normalizeIsoDate(stream.startedAt, startedAtFallback);
  const endedAtFallback = new Date(new Date(startedAt).getTime() + durationMinutes * 60_000).toISOString();
  const candidateEndedAt = normalizeIsoDate(stream.endedAt, endedAtFallback);
  const averageViewers = normalizeInteger(stream.averageViewers, 0, 0, 10_000_000);
  const topWords = Array.isArray(stream.topWords)
    ? stream.topWords
        .filter((word) => typeof word === "string" && word.trim())
        .slice(0, 5)
        .map((word) => word.trim().slice(0, 32))
    : [];

  return {
    streamId,
    date,
    title,
    categoryName,
    startedAt,
    endedAt: new Date(candidateEndedAt) > new Date(startedAt) ? candidateEndedAt : endedAtFallback,
    durationMinutes,
    averageViewers,
    peakViewers: Math.max(averageViewers, normalizeInteger(stream.peakViewers, averageViewers, 0, 20_000_000)),
    totalMessages: normalizeInteger(stream.totalMessages, 0, 0, 100_000_000),
    uniqueChatters: normalizeInteger(stream.uniqueChatters, 0, 0, 10_000_000),
    moderationActions: normalizeInteger(stream.moderationActions, 0, 0, 10_000_000),
    topWords: topWords.length ? topWords : ["стрим"],
    topMoment: normalizeString(stream.topMoment, "Главный момент стрима", 180),
    summary: normalizeString(stream.summary, "Завершённая демонстрационная сессия.", 240),
    status: normalizeString(stream.status, "completed", 24),
  };
}

function normalizeArchive(data) {
  if (!data || typeof data !== "object" || !Array.isArray(data.streams)) {
    throw new TypeError("Stream archive does not match the expected normalized shape.");
  }

  const uniqueStreams = new Map();

  for (const candidate of data.streams) {
    const stream = normalizeArchivedStream(candidate);

    if (stream && !uniqueStreams.has(stream.streamId)) {
      uniqueStreams.set(stream.streamId, stream);
    }
  }

  const streams = [...uniqueStreams.values()]
    .sort((first, second) => second.date.localeCompare(first.date) || second.startedAt.localeCompare(first.startedAt))
    .slice(0, maximumStreams);

  if (streams.length === 0) {
    throw new TypeError("Stream archive must contain at least one valid stream.");
  }

  return {
    channelLogin: normalizeString(data.channelLogin, "fenya", 32).toLowerCase(),
    updatedAt: typeof data.updatedAt === "string" && data.updatedAt ? data.updatedAt : null,
    streams,
  };
}

async function initializeFromMock() {
  const mockArchive = await getStreamArchive("fenya");

  try {
    return await saveStreamArchive(mockArchive);
  } catch (error) {
    console.error("Failed to initialize local stream archive:", error);
    return normalizeArchive(mockArchive);
  }
}

export async function loadStreamArchive() {
  try {
    const contents = await readFile(archiveFilePath, "utf8");
    const storedArchive = JSON.parse(contents);
    const archive = normalizeArchive(storedArchive);

    if (!archive.updatedAt || JSON.stringify(archive) !== JSON.stringify(storedArchive)) {
      return saveStreamArchive(archive);
    }

    return archive;
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn("Local stream archive is unavailable or invalid; restoring mock data:", error);
    }

    return initializeFromMock();
  }
}

export async function saveStreamArchive(data) {
  const archive = {
    ...normalizeArchive(data),
    updatedAt: new Date().toISOString(),
  };

  pendingWrite = pendingWrite
    .catch(() => undefined)
    .then(async () => {
      await mkdir(dataDirectory, { recursive: true });
      const temporaryPath = `${archiveFilePath}.${process.pid}.${Date.now()}.tmp`;

      try {
        await writeFile(temporaryPath, `${JSON.stringify(archive, null, 2)}\n`, "utf8");
        await rename(temporaryPath, archiveFilePath);
      } catch (error) {
        await unlink(temporaryPath).catch(() => undefined);
        throw error;
      }
    });

  await pendingWrite;
  return archive;
}

export async function appendMockArchivedStream(stream) {
  const archive = await loadStreamArchive();
  const normalizedStream = normalizeArchivedStream(stream);

  if (!normalizedStream) {
    throw new TypeError("Archived stream does not match the expected normalized shape.");
  }

  const baseStreamId = normalizedStream.streamId;
  let uniqueStreamId = baseStreamId;
  let suffix = 2;

  while (archive.streams.some((entry) => entry.streamId === uniqueStreamId)) {
    uniqueStreamId = `${baseStreamId}-${suffix}`;
    suffix += 1;
  }

  return saveStreamArchive({
    ...archive,
    streams: [{ ...normalizedStream, streamId: uniqueStreamId }, ...archive.streams],
  });
}

export async function resetStreamArchive() {
  return saveStreamArchive(await getStreamArchive("fenya"));
}

export async function getArchivedStreamById(streamId) {
  const normalizedStreamId = normalizeString(streamId, "", 80);

  if (!normalizedStreamId) {
    return null;
  }

  const archive = await loadStreamArchive();
  return archive.streams.find((stream) => stream.streamId === normalizedStreamId) ?? null;
}
