import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { getCurrentStreamAnalytics } from "./providers/mockAnalyticsProvider.js";
import { getStreamArchive } from "./providers/mockArchiveProvider.js";
import { getCurrentChatAnalytics } from "./providers/mockChatProvider.js";
import { getCurrentModerationAnalytics } from "./providers/mockModerationProvider.js";
import { getCurrentStreamSummary } from "./providers/mockSummaryProvider.js";
import { getCurrentWordAnalytics } from "./providers/mockWordsProvider.js";
import { loadAdvancedAnalyticsDataset } from "./repositories/advancedAnalyticsRepository.js";
import { seedDashboardData } from "./repositories/dashboardRepository.js";
import { calculateLoyalty } from "./services/advancedAnalyticsService.js";
import { closeDatabase, getDatabase } from "./storage/db.js";

let temporaryDirectory;

async function seedMockDashboard() {
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
  temporaryDirectory = await mkdtemp(join(tmpdir(), "fenya-mock-loyalty-"));
  process.env.DATABASE_PATH = join(temporaryDirectory, "test.sqlite");
});

afterEach(async () => {
  closeDatabase();
  delete process.env.DATABASE_PATH;
  await rm(temporaryDirectory, { recursive: true, force: true });
});

describe("deterministic mock chat participation history", () => {
  test("seeds saved chat participation for every loyalty category without watch-time inference", async () => {
    await seedMockDashboard();
    const loyalty = calculateLoyalty(loadAdvancedAnalyticsDataset("2026-06-23", {
      legacyChannelLogin: "fenya",
    }));
    const categories = Object.fromEntries(
      loyalty.participants.map((participant) => [participant.login, participant.category]),
    );

    expect(categories).toMatchObject({
      agapuku106: "regular",
      mirepilot: "returning",
      acid_masha: "reactivated",
      slimeoracle: "new",
    });
    expect(loyalty.isSufficient).toBe(true);
    expect(getDatabase().prepare(`
      SELECT COUNT(*) AS count FROM chatters WHERE stream_id <> '2026-06-23'
    `).get().count).toBe(11);
  });

  test("remains idempotent when the deterministic dashboard is reseeded", async () => {
    await seedMockDashboard();
    await seedMockDashboard();

    expect(getDatabase().prepare(`
      SELECT COUNT(*) AS count FROM chatters WHERE stream_id <> '2026-06-23'
    `).get().count).toBe(11);
  });
});
