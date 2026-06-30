import { randomUUID } from "node:crypto";
import process from "node:process";

import { getDatabase } from "../storage/db.js";
import { loadStreamDataset, normalizeStreamId } from "../repositories/streamReportRepository.js";

const allowedSpeeds = new Set([1, 5, 20]);
const sessions = new Map();

function toMinutes(time) {
  if (!/^\d{2}:\d{2}$/.test(time ?? "")) return 0;
  const [hours, minutes] = time.split(":").map(Number);
  return (hours < 6 ? hours + 24 : hours) * 60 + minutes;
}

function buildEvents(streamId) {
  let dataset = loadStreamDataset(streamId);
  let demoFallback = false;
  const hasDetailedData = dataset && [dataset.viewerSamples, dataset.chatMessages, dataset.moderationActions, dataset.markers]
    .some((items) => items.length > 0);

  if (!hasDetailedData) {
    dataset = loadStreamDataset("2026-06-23");
    demoFallback = true;
  }

  if (!dataset) throw new Error("Seeded replay data is unavailable. Run npm run db:seed first.");

  const events = [
    ...dataset.viewerSamples.map((sample) => ({ type: "viewer_sample", time: sample.time, data: sample })),
    ...dataset.chatMessages.map((message) => ({ type: "chat_message", time: message.time, data: message })),
    ...dataset.moderationActions.map((action) => ({ type: "moderation_action", time: action.time, data: action })),
    ...dataset.markers.map((marker) => ({ type: "stream_marker", time: marker.time, data: marker })),
  ].sort((first, second) => toMinutes(first.time) - toMinutes(second.time));

  return events.map((event, index) => ({
    ...event,
    sequence: index + 1,
    streamId: normalizeStreamId(streamId),
    demoFallback,
  }));
}

function persistSession(session) {
  const database = getDatabase();
  const persistedStreamId = database.prepare("SELECT stream_id FROM streams WHERE stream_id = ?").get(session.streamId)?.stream_id ?? null;
  database.prepare(`
    INSERT INTO replay_sessions (session_id, stream_id, status, options_json, started_at, completed_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET status = excluded.status,
      options_json = excluded.options_json, completed_at = excluded.completed_at
  `).run(
    session.sessionId,
    persistedStreamId,
    session.status,
    JSON.stringify({ speed: session.speed, eventCount: session.events.length, cursor: session.cursor }),
    session.startedAt,
    session.completedAt,
    session.startedAt,
  );
}

function send(client, type, payload) {
  if (client.writableEnded || client.destroyed) return;
  client.write(`event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function broadcast(session, type, payload) {
  session.lastEvent = { type, payload };
  for (const client of session.clients) send(client, type, payload);
}

function publicStatus(session) {
  if (!session) return { status: "idle", isActive: false, speed: null, progress: 0 };
  return {
    sessionId: session.sessionId,
    streamId: session.streamId,
    status: session.status,
    isActive: session.status === "running",
    speed: session.speed,
    cursor: session.cursor,
    eventCount: session.events.length,
    progress: session.events.length ? Math.round((session.cursor / session.events.length) * 100) : 100,
    startedAt: session.startedAt,
    completedAt: session.completedAt,
    demoFallback: session.events[0]?.demoFallback ?? true,
  };
}

function finish(session, reason = "completed") {
  if (session.timer) clearTimeout(session.timer);
  session.timer = null;
  session.status = reason === "error" ? "error" : reason === "stopped" ? "stopped" : "finished";
  session.completedAt = new Date().toISOString();
  persistSession(session);
  const type = reason === "error" ? "replay_error" : "replay_finished";
  broadcast(session, type, { ...publicStatus(session), reason });
}

function scheduleNext(session) {
  if (session.status !== "running") return;
  if (session.cursor >= session.events.length) {
    finish(session);
    return;
  }

  const event = session.events[session.cursor];
  const previous = session.events[session.cursor - 1];
  const streamMinuteMs = Math.max(25, Number(process.env.REPLAY_MS_PER_STREAM_MINUTE) || 250);
  const minuteDelta = previous ? Math.max(1, toMinutes(event.time) - toMinutes(previous.time)) : 0;
  const delay = Math.max(20, (minuteDelta * streamMinuteMs) / session.speed);
  session.timer = setTimeout(() => {
    try {
      session.cursor += 1;
      broadcast(session, event.type, { ...event.data, streamId: session.streamId, sequence: event.sequence, demoFallback: event.demoFallback });
      persistSession(session);
      scheduleNext(session);
    } catch (error) {
      console.error("Replay event failed:", error);
      finish(session, "error");
    }
  }, delay);
}

export function startReplay(streamId, requestedSpeed) {
  const normalizedId = normalizeStreamId(streamId);
  const speed = Number(requestedSpeed ?? 1);
  if (!allowedSpeeds.has(speed)) throw new TypeError("Replay speed must be 1, 5, or 20.");
  const existing = sessions.get(normalizedId);
  if (existing?.status === "running") {
    const error = new Error("A replay session is already running for this stream.");
    error.code = "REPLAY_DUPLICATE";
    throw error;
  }

  const session = {
    sessionId: randomUUID(),
    streamId: normalizedId,
    status: "running",
    speed,
    events: buildEvents(normalizedId),
    cursor: 0,
    clients: existing?.clients ?? new Set(),
    timer: null,
    startedAt: new Date().toISOString(),
    completedAt: null,
    lastEvent: null,
  };
  sessions.set(normalizedId, session);
  persistSession(session);
  broadcast(session, "replay_started", publicStatus(session));
  scheduleNext(session);
  return publicStatus(session);
}

export function stopReplay(streamId) {
  const session = sessions.get(normalizeStreamId(streamId));
  if (!session || session.status !== "running") return publicStatus(session);
  finish(session, "stopped");
  return publicStatus(session);
}

export function getReplayStatus(streamId) {
  return publicStatus(sessions.get(normalizeStreamId(streamId)));
}

export function subscribeToReplay(streamId, response) {
  const normalizedId = normalizeStreamId(streamId);
  let session = sessions.get(normalizedId);
  if (!session) {
    session = { streamId: normalizedId, status: "idle", speed: null, cursor: 0, events: [], clients: new Set(), startedAt: null, completedAt: null };
    sessions.set(normalizedId, session);
  }
  session.clients.add(response);
  send(response, session.status === "running" ? "replay_started" : "replay_finished", publicStatus(session));
  return () => session.clients.delete(response);
}
