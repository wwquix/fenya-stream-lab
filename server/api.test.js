import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

import request from "supertest";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { createApp } from "./app.js";
import { getCurrentStreamAnalytics } from "./providers/mockAnalyticsProvider.js";
import { getStreamArchive } from "./providers/mockArchiveProvider.js";
import { getCurrentChatAnalytics } from "./providers/mockChatProvider.js";
import { getCurrentModerationAnalytics } from "./providers/mockModerationProvider.js";
import { getCurrentStreamSummary } from "./providers/mockSummaryProvider.js";
import { getCurrentWordAnalytics } from "./providers/mockWordsProvider.js";
import { seedDashboardData } from "./repositories/dashboardRepository.js";
import { closeDatabase, getDatabase } from "./storage/db.js";

const app = createApp();
let temporaryDirectory;

async function seedTemporaryDatabase() {
  const [analytics, archive, chat, moderation, summary, words] = await Promise.all([
    getCurrentStreamAnalytics("fenya"),
    getStreamArchive("fenya"),
    getCurrentChatAnalytics("fenya"),
    getCurrentModerationAnalytics("fenya"),
    getCurrentStreamSummary("fenya"),
    getCurrentWordAnalytics("fenya"),
  ]);
  seedDashboardData({ analytics, archive, chat, moderation, summary, words });
}

beforeEach(async () => {
  closeDatabase();
  temporaryDirectory = await mkdtemp(join(tmpdir(), "fenya-stream-lab-test-"));
  process.env.DATABASE_PATH = join(temporaryDirectory, "test.sqlite");
  process.env.TWITCH_PROVIDER = "mock";
  process.env.SUMMARY_PROVIDER = "local";
  process.env.REPLAY_MS_PER_STREAM_MINUTE = "1";
});

afterEach(async () => {
  closeDatabase();
  delete process.env.DATABASE_PATH;
  delete process.env.TWITCH_PROVIDER;
  delete process.env.SUMMARY_PROVIDER;
  delete process.env.REPLAY_MS_PER_STREAM_MINUTE;
  await rm(temporaryDirectory, { recursive: true, force: true });
});

describe("Fenya Stream Lab API", () => {
  test("GET /api/health reports the local service status", async () => {
    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: "ok", service: "fenya-stream-lab-api", provider: "mock" });
  });

  test("database initialization creates the required SQLite tables", () => {
    const database = getDatabase();
    const tables = database.prepare(`
      SELECT name FROM sqlite_master WHERE type = 'table'
    `).all().map((row) => row.name);

    expect(tables).toEqual(expect.arrayContaining([
      "streams", "viewer_samples", "chat_messages", "import_jobs", "stream_summaries", "replay_sessions",
    ]));
    expect(database.pragma("foreign_keys", { simple: true })).toBe(1);
  });

  test("seeded streams are available through the archive endpoint", async () => {
    await seedTemporaryDatabase();
    const response = await request(app).get("/api/archive/fenya/streams");

    expect(response.status).toBe(200);
    expect(response.body.streams.length).toBeGreaterThanOrEqual(4);
    expect(response.body.streams.some((stream) => stream.streamId === "2026-06-23")).toBe(true);
  });

  test("valid normalized JSON events are imported into SQLite", async () => {
    const response = await request(app).post("/api/import/json").send([
      {
        eventId: "test-viewer-001",
        type: "viewer_sample",
        streamId: "test-import-stream",
        timestamp: "2026-06-30T18:00:00.000Z",
        viewers: 4200,
        messagesPerMinute: 640,
      },
      {
        eventId: "test-chat-001",
        type: "chat_message",
        streamId: "test-import-stream",
        timestamp: "2026-06-30T18:00:03.000Z",
        chatter: "portfolio_viewer",
        message: "сильный момент",
        messageType: "normal",
      },
    ]);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ status: "completed", totalCount: 2, successCount: 2, rejectedCount: 0 });
    expect(getDatabase().prepare("SELECT COUNT(*) AS count FROM viewer_samples").get().count).toBe(1);
    expect(getDatabase().prepare("SELECT COUNT(*) AS count FROM chat_messages").get().count).toBe(1);
  });

  test("invalid normalized JSON events return clear row-level errors", async () => {
    const response = await request(app).post("/api/import/json").send([
      { type: "viewer_sample", streamId: "invalid-stream", viewers: -1 },
    ]);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ status: "failed", successCount: 0, rejectedCount: 1 });
    const errors = await request(app).get(`/api/import/${response.body.jobId}/errors`);
    expect(errors.status).toBe(200);
    expect(errors.body.errors[0].message).toContain("timestamp");
    expect(errors.body.errors[0].message).toContain("viewers");
  });

  test("malformed JSON receives a stable 400 error envelope", async () => {
    const response = await request(app)
      .post("/api/import/json")
      .set("Content-Type", "application/json")
      .send('{"type":');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: true, message: "Request body contains invalid JSON." });
  });

  test("a local stream summary can be generated without external providers", async () => {
    await seedTemporaryDatabase();
    const response = await request(app).post("/api/streams/2026-06-23/summary/generate");

    expect(response.status).toBe(201);
    expect(response.body.provider).toBe("local");
    expect(response.body.metrics.peakViewers).toBeGreaterThan(0);
    expect(response.body.topChatters.length).toBeGreaterThan(0);
    expect(response.body.suggestedClipMoments).toBeInstanceOf(Array);
  });

  test("the stream report JSON endpoint returns the generated report", async () => {
    await seedTemporaryDatabase();
    const response = await request(app).get("/api/streams/2026-06-23/report/json");

    expect(response.status).toBe(200);
    expect(response.body.stream.streamId).toBe("2026-06-23");
    expect(response.body.summary.provider).toBe("local");
    expect(response.body.analytics.suggestedClipMoments).toBeInstanceOf(Array);
  });

  test("the stream report Markdown endpoint returns readable Markdown", async () => {
    await seedTemporaryDatabase();
    const response = await request(app).get("/api/streams/2026-06-23/report/markdown");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/markdown");
    expect(response.text).toContain("# Отчёт по стриму");
    expect(response.text).toContain("## Предложенные клипы");
  });

  test("replay start, status, and stop use one isolated stream session", async () => {
    await seedTemporaryDatabase();
    const started = await request(app).post("/api/replay/2026-06-23/start").send({ speed: 20 });

    expect(started.status).toBe(201);
    expect(started.body).toMatchObject({ streamId: "2026-06-23", status: "running", speed: 20, isActive: true });

    const status = await request(app).get("/api/replay/2026-06-23/status");
    expect(status.status).toBe(200);
    expect(status.body.sessionId).toBe(started.body.sessionId);

    const stopped = await request(app).post("/api/replay/2026-06-23/stop");
    expect(stopped.status).toBe(200);
    expect(stopped.body).toMatchObject({ status: "stopped", isActive: false });
  });
});
