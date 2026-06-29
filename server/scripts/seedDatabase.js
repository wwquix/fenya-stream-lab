import dotenv from "dotenv";

import { getCurrentStreamAnalytics } from "../providers/mockAnalyticsProvider.js";
import { getStreamArchive } from "../providers/mockArchiveProvider.js";
import { getCurrentChatAnalytics } from "../providers/mockChatProvider.js";
import { getCurrentModerationAnalytics } from "../providers/mockModerationProvider.js";
import { getCurrentStreamSummary } from "../providers/mockSummaryProvider.js";
import { getCurrentWordAnalytics } from "../providers/mockWordsProvider.js";
import { seedDashboardData } from "../repositories/dashboardRepository.js";
import { closeDatabase, getDatabasePath } from "../storage/db.js";

dotenv.config();

async function seed() {
  const [analytics, archive, chat, moderation, summary, words] = await Promise.all([
    getCurrentStreamAnalytics("fenya"),
    getStreamArchive("fenya"),
    getCurrentChatAnalytics("fenya"),
    getCurrentModerationAnalytics("fenya"),
    getCurrentStreamSummary("fenya"),
    getCurrentWordAnalytics("fenya"),
  ]);

  seedDashboardData({ analytics, archive, chat, moderation, summary, words });
  console.log(`Seeded Fenya Stream Lab SQLite database at ${getDatabasePath()}`);
}

try {
  await seed();
} finally {
  closeDatabase();
}
