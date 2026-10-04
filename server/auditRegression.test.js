import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import request from "supertest";
import express from "express";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { createApp } from "./app.js";
import { createRateLimitMiddleware, isLocalDemoMutation, isSensitiveMutation } from "./middleware/httpHardening.js";
import { getReplayStatus, stopAllReplays, subscribeToReplay } from "./services/replayService.js";
import { closeDatabase } from "./storage/db.js";

let directory;
let originalEnv;

beforeEach(() => {
  originalEnv = { ...process.env };
  directory = mkdtempSync(join(tmpdir(), "fenya-audit-"));
  process.env.DATABASE_PATH = join(directory, "test.sqlite");
  process.env.NODE_ENV = "development";
  process.env.TWITCH_PROVIDER = "mock";
  process.env.SUMMARY_PROVIDER = "local";
});

afterEach(() => {
  stopAllReplays();
  closeDatabase();
  process.env = originalEnv;
  rmSync(directory, { recursive: true, force: true });
});

const event = {
  eventId: "audit-viewer", type: "viewer_sample", streamId: "audit-stream",
  timestamp: "2026-10-04T12:00:00.000Z", viewers: 42, messagesPerMinute: 3,
};

describe("local demo workflow and security boundaries", () => {
  test("imports, generates a report, and starts/stops replay without Twitch credentials locally", async () => {
    const app = createApp({ serveFrontend: false });
    expect((await request(app).get("/api/me")).body.permissions.canWriteDemo).toBe(true);
    const imported = await request(app).post("/api/import/json").set("Origin", "http://localhost:5173").send([event]);
    expect(imported.status).toBe(201);
    expect(imported.body.successCount).toBe(1);
    expect((await request(app).post("/api/streams/audit-stream/summary/generate")).status).toBe(201);
    const report = await request(app).get("/api/streams/audit-stream/report/json");
    expect(report.status).toBe(200);
    expect(report.body.summary.metrics.peakViewers).toBe(42);
    expect((await request(app).post("/api/replay/audit-stream/start").send({ speed: 5 })).status).toBe(201);
    expect((await request(app).post("/api/replay/audit-stream/stop")).status).toBe(200);
  });

  test.each(["production", "test"])("keeps guest writes protected in %s", async (nodeEnv) => {
    process.env.NODE_ENV = nodeEnv;
    const app = createApp({ serveFrontend: false });
    expect((await request(app).get("/api/me")).body.permissions.canWriteDemo).toBe(false);
    expect((await request(app).post("/api/import/json").send([event])).status).toBe(401);
    expect((await request(app).post("/api/replay/audit-stream/start").send({ speed: 5 })).status).toBe(401);
    expect((await request(app).post("/api/streams/audit-stream/summary/generate")).status).toBe(401);
  });

  test("keeps channel/auth/Twitch writes outside the local demo exception", async () => {
    const app = createApp({ serveFrontend: false });
    expect((await request(app).post("/api/channels/connect-my-channel")).status).toBe(401);
    expect((await request(app).post("/api/twitch/fenya/ingest/start")).status).toBe(401);
    process.env.TWITCH_PROVIDER = "twitch";
    expect((await request(app).get("/api/me")).body.provider).toBe("twitch");
    expect((await request(app).post("/api/import/json").send([event])).status).toBe(401);
  });

  test("does not trust a remote client's forwarded loopback address", () => {
    const req = { method: "POST", path: "/import/json", headers: { "x-forwarded-for": "127.0.0.1" }, socket: { remoteAddress: "192.0.2.1" } };
    expect(isLocalDemoMutation(req)).toBe(false);
  });

  test("rejects foreign and null origins before import/logout handlers run", async () => {
    const app = createApp({ serveFrontend: false });
    for (const origin of ["https://evil.example.com", "null"]) {
      expect((await request(app).post("/auth/logout").set("Origin", origin)).status).toBe(403);
      expect((await request(app).post("/api/import/json").set("Origin", origin).send([event])).status).toBe(403);
    }
    expect((await request(app).post("/auth/logout").set("Sec-Fetch-Site", "cross-site")).status).toBe(403);
    expect((await request(app).post("/auth/logout")).status).toBe(204);
  });

  test("allows only the configured production origin for browser mutations", async () => {
    process.env.NODE_ENV = "production";
    process.env.APP_BASE_URL = "https://stats.example.com";
    const app = createApp({ serveFrontend: false });
    expect((await request(app).post("/auth/logout").set("Origin", "https://stats.example.com")).status).toBe(204);
    expect((await request(app).post("/auth/logout").set("Origin", "https://other.example.com")).status).toBe(403);
  });

  test("rate-limits OAuth GET navigation", async () => {
    const limited = express();
    limited.use(createRateLimitMiddleware({ max: 1, matcher: isSensitiveMutation }));
    limited.get("/auth/twitch/login", (_req, res) => res.json({ ok: true }));
    expect((await request(limited).get("/auth/twitch/login")).status).toBe(200);
    const blocked = await request(limited).get("/AUTH/TWITCH/LOGIN/");
    expect(blocked.status).toBe(429);
    expect(blocked.headers["retry-after"]).toBeDefined();
  });

  test("removes idle SSE state only after the last client disconnects", () => {
    const first = subscribeToReplay("unknown-audit-stream", { write: () => {} });
    const second = subscribeToReplay("unknown-audit-stream", { write: () => {} });
    expect(getReplayStatus("unknown-audit-stream").streamId).toBe("unknown-audit-stream");
    first();
    expect(getReplayStatus("unknown-audit-stream").streamId).toBe("unknown-audit-stream");
    second();
    expect(getReplayStatus("unknown-audit-stream").streamId).toBeUndefined();
  });
});
