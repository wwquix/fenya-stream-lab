import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import request from "supertest";
import { afterEach, describe, expect, test } from "vitest";

import { createApp } from "./app.js";

let temporaryDirectory = null;

afterEach(() => {
  if (temporaryDirectory) rmSync(temporaryDirectory, { recursive: true, force: true });
  temporaryDirectory = null;
});

describe("production frontend serving", () => {
  test("serves built assets and the SPA shell without swallowing API 404 responses", async () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), "fenya-dist-"));
    writeFileSync(join(temporaryDirectory, "index.html"), "<!doctype html><div id=\"root\">production-shell</div>");
    writeFileSync(join(temporaryDirectory, "app.js"), "window.__FENYA_BUILD__ = true;");
    const app = createApp({ serveFrontend: true, frontendDistPath: temporaryDirectory });

    const [root, spaRoute, asset, apiMissing] = await Promise.all([
      request(app).get("/"),
      request(app).get("/unknown-dashboard-route"),
      request(app).get("/app.js"),
      request(app).get("/api/does-not-exist"),
    ]);

    expect(root.status).toBe(200);
    expect(root.text).toContain("production-shell");
    expect(spaRoute.status).toBe(200);
    expect(spaRoute.text).toContain("production-shell");
    expect(asset.status).toBe(200);
    expect(asset.text).toContain("__FENYA_BUILD__");
    expect(apiMissing.status).toBe(404);
    expect(apiMissing.body).toEqual(expect.objectContaining({ error: true }));
  });
});
