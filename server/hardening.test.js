import express from "express";
import process from "node:process";
import request from "supertest";
import { afterEach, describe, expect, test } from "vitest";

import { createApp } from "./app.js";
import { validateEnv } from "./config/validateEnv.js";
import { errorHandler, routeHandler } from "./middleware/errorHandlers.js";

const originalEnv = { ...process.env };
const validTokenKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("environment validation", () => {
  test("accepts the default mock development environment", () => {
    expect(validateEnv({ NODE_ENV: "development", TWITCH_PROVIDER: "mock", PORT: "3001" })).toMatchObject({
      nodeEnv: "development",
      twitchProvider: "mock",
      isProduction: false,
    });
  });

  test("fails early in production Twitch mode when required values are absent", () => {
    expect(() => validateEnv({
      NODE_ENV: "production",
      TWITCH_PROVIDER: "twitch",
      DATABASE_PATH: "server/data/prod.sqlite",
    })).toThrow(/TWITCH_CLIENT_ID is required/);
  });

  test("validates token encryption key shape without exposing its value", () => {
    expect(() => validateEnv({
      NODE_ENV: "production",
      TWITCH_PROVIDER: "twitch",
      APP_BASE_URL: "https://stats.example.com",
      TWITCH_REDIRECT_URI: "https://stats.example.com/auth/twitch/callback",
      TWITCH_CLIENT_ID: "client-id",
      TWITCH_CLIENT_SECRET: "client-secret",
      TWITCH_CHANNEL_LOGIN: "fenya",
      DATABASE_PATH: "/srv/fenya.sqlite",
      TOKEN_ENCRYPTION_KEY: "too-short",
    })).toThrow(/TOKEN_ENCRYPTION_KEY must encode exactly 32 bytes/);
  });

  test("accepts a complete production Twitch configuration", () => {
    expect(validateEnv({
      NODE_ENV: "production",
      TWITCH_PROVIDER: "twitch",
      APP_BASE_URL: "https://stats.example.com",
      TWITCH_REDIRECT_URI: "https://stats.example.com/auth/twitch/callback",
      TWITCH_CLIENT_ID: "client-id",
      TWITCH_CLIENT_SECRET: "client-secret",
      TWITCH_CHANNEL_LOGIN: "fenya",
      DATABASE_PATH: "/srv/fenya.sqlite",
      TOKEN_ENCRYPTION_KEY: validTokenKey,
    })).toMatchObject({ isProduction: true, twitchProvider: "twitch" });
  });

  test("production Twitch autostart does not require legacy environment tokens", () => {
    expect(validateEnv({
      NODE_ENV: "production",
      TWITCH_PROVIDER: "twitch",
      TWITCH_LIVE_INGEST_AUTOSTART: "true",
      APP_BASE_URL: "https://stats.example.com",
      TWITCH_REDIRECT_URI: "https://stats.example.com/auth/twitch/callback",
      TWITCH_CLIENT_ID: "client-id",
      TWITCH_CLIENT_SECRET: "client-secret",
      TWITCH_CHANNEL_LOGIN: "fenya",
      DATABASE_PATH: "/srv/fenya.sqlite",
      TOKEN_ENCRYPTION_KEY: validTokenKey,
    })).toMatchObject({ isProduction: true, twitchProvider: "twitch" });
  });
});

describe("HTTP hardening", () => {
  test("adds lightweight security headers", async () => {
    const response = await request(createApp({ serveFrontend: false })).get("/health");

    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(response.headers["x-frame-options"]).toBe("SAMEORIGIN");
  });

  test("allows local development CORS origins", async () => {
    process.env.NODE_ENV = "development";
    const response = await request(createApp({ serveFrontend: false }))
      .get("/health")
      .set("Origin", "http://localhost:5173");

    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });

  test("restricts production CORS to APP_BASE_URL", async () => {
    process.env.NODE_ENV = "production";
    process.env.APP_BASE_URL = "https://stats.example.com";
    const app = createApp({ serveFrontend: false });

    const allowed = await request(app).get("/health").set("Origin", "https://stats.example.com");
    const blocked = await request(app).get("/health").set("Origin", "https://evil.example.com");

    expect(allowed.headers["access-control-allow-origin"]).toBe("https://stats.example.com");
    expect(blocked.headers["access-control-allow-origin"]).toBeUndefined();
  });

  test("blocks legacy demo analytics writes in production before auth", async () => {
    process.env.NODE_ENV = "production";
    const response = await request(createApp({ serveFrontend: false }))
      .post("/api/analytics/fenya/sample")
      .send({ viewers: 100 });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: true,
      message: "Local demo mutation endpoints are disabled in production.",
    });
  });

  test("legacy Twitch ingest controls still require authentication in production", async () => {
    process.env.NODE_ENV = "production";
    const response = await request(createApp({ serveFrontend: false }))
      .post("/api/twitch/fenya/ingest/start")
      .send({});

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Authentication required");
  });

  test("keeps mock read endpoints available in production", async () => {
    process.env.NODE_ENV = "production";
    process.env.TWITCH_PROVIDER = "mock";
    const response = await request(createApp({ serveFrontend: false })).get("/api/twitch/fenya");

    expect(response.status).toBe(200);
    expect(response.body.displayName).toBe("Fenya");
  });

  test("does not leak raw server error messages", async () => {
    const app = express();
    app.get("/unsafe", routeHandler(async () => {
      throw new Error("SQLITE_SECRET_TOKEN raw provider failure");
    }, "Failed to load unsafe route"));
    app.use(errorHandler);

    const response = await request(app).get("/unsafe");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: true, message: "Failed to load unsafe route" });
    expect(response.text).not.toContain("SQLITE_SECRET_TOKEN");
  });
});
