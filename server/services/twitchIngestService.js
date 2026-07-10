import { saveTwitchStreamSnapshot } from "../repositories/twitchIngestRepository.js";
import process from "node:process";
import { HttpError } from "../middleware/errorHandlers.js";
import { findChannelByLogin } from "../repositories/channelRepository.js";
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

function legacyDevelopmentMode() {
  return process.env.NODE_ENV !== "production"
    && String(process.env.TWITCH_LEGACY_ENV_TOKEN_MODE || "").trim().toLowerCase() === "true";
}

export function resolveConfiguredIngestChannel() {
  return findChannelByLogin(process.env.TWITCH_CHANNEL_LOGIN?.trim() || "fenya");
}

function shouldUseDatabaseChannel(channel) {
  return Boolean(channel && (!legacyDevelopmentMode() || channel.owner_user_id));
}

export function getTwitchIngestStatus() {
  const channel = resolveConfiguredIngestChannel();
  if (shouldUseDatabaseChannel(channel)) return getChannelIngestStatus(channel.id);
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
  if (!["twitch", "real"].includes(String(process.env.TWITCH_PROVIDER || "mock").trim().toLowerCase())) {
    return startChannelIngest(LEGACY_FENYA_CHANNEL_ID, { legacy: true });
  }
  const channel = resolveConfiguredIngestChannel();
  if (shouldUseDatabaseChannel(channel)) return startChannelIngest(channel.id);
  if (legacyDevelopmentMode()) return startChannelIngest(LEGACY_FENYA_CHANNEL_ID, { legacy: true });
  throw new HttpError(409, "Configured Twitch channel is not connected; reconnect Twitch");
}

export function stopTwitchIngest() {
  const channel = resolveConfiguredIngestChannel();
  if (shouldUseDatabaseChannel(channel)) return stopChannelIngest(channel.id);
  return stopChannelIngest(LEGACY_FENYA_CHANNEL_ID);
}

export function setTwitchWebSocketFactoryForTests(factory) {
  setTwitchIngestPoolWebSocketFactoryForTests(factory);
}

export function resetTwitchIngestForTests() {
  resetTwitchIngestPoolForTests();
}
