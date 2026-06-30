import process from "node:process";

import { generateLocalSummary } from "../providers/localSummaryProvider.js";
import { generateMockSummary } from "../providers/mockSummaryProvider.js";
import { generateOpenAiSummary } from "../providers/openAiSummaryProvider.js";
import { loadStoredStreamSummary, saveStoredStreamSummary } from "../repositories/streamReportRepository.js";

const providers = {
  local: generateLocalSummary,
  mock: generateMockSummary,
  openai: generateOpenAiSummary,
};

export function getStreamSummary(streamId) {
  return loadStoredStreamSummary(streamId);
}

export async function generateStreamSummary(streamId) {
  const providerName = String(process.env.SUMMARY_PROVIDER || "local").trim().toLowerCase();
  const provider = providers[providerName];
  if (!provider) throw new Error(`Unknown summary provider "${providerName}".`);
  return saveStoredStreamSummary(await provider(streamId));
}

