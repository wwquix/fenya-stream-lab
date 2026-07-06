import { saveTwitchStreamSnapshot } from "../repositories/twitchIngestRepository.js";
import {
  getChannelIngestStatus,
  processChannelEventSubNotification,
  resetTwitchIngestPoolForTests,
  setTwitchIngestPoolWebSocketFactoryForTests,
  startChannelIngest,
  stopChannelIngest,
} from "./twitchIngestPoolService.js";
import { loadTwitchChannelMetadata } from "./twitchMetadataService.js";

export const LEGACY_FENYA_CHANNEL_ID = "legacy:fenya";

export function getTwitchIngestStatus() {
  return getChannelIngestStatus(LEGACY_FENYA_CHANNEL_ID);
}

export async function pollTwitchStreamOnce() {
  const metadata = await loadTwitchChannelMetadata();
  saveTwitchStreamSnapshot(metadata, new Date().toISOString());
  return metadata;
}

export function processEventSubNotification(message) {
  return processChannelEventSubNotification(LEGACY_FENYA_CHANNEL_ID, message);
}

export function startTwitchIngest() {
  return startChannelIngest(LEGACY_FENYA_CHANNEL_ID, { legacy: true });
}

export function stopTwitchIngest() {
  return stopChannelIngest(LEGACY_FENYA_CHANNEL_ID);
}

export function setTwitchWebSocketFactoryForTests(factory) {
  setTwitchIngestPoolWebSocketFactoryForTests(factory);
}

export function resetTwitchIngestForTests() {
  resetTwitchIngestPoolForTests();
}
