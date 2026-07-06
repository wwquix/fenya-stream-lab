import { HttpError } from "../middleware/errorHandlers.js";
import { findOrCreateChannelFromBroadcaster, getUserChannels } from "../repositories/channelRepository.js";
import { addOrUpdateChannelMembership } from "../repositories/membershipRepository.js";
import { findTwitchIdentityByUserId } from "../repositories/twitchAccountRepository.js";
import { getDatabase } from "../storage/db.js";
import { getChannelIngestStatus } from "./twitchIngestPoolService.js";

const REQUIRED_INGEST_SCOPES = ["user:read:chat"];

function parseScopes(value) {
  try {
    const scopes = JSON.parse(value || "[]");
    return Array.isArray(scopes) ? scopes : [];
  } catch {
    return [];
  }
}

function toChannelContract(channel, database = getDatabase()) {
  const ingest = getChannelIngestStatus(channel.id);
  const ownerAccount = channel.owner_user_id
    ? database.prepare("SELECT scopes_json, needs_reauth FROM twitch_accounts WHERE user_id = ?").get(channel.owner_user_id)
    : null;
  const grantedScopes = new Set(parseScopes(ownerAccount?.scopes_json));
  const missingScopes = REQUIRED_INGEST_SCOPES.filter((scope) => !grantedScopes.has(scope));
  const needsReauth = Boolean(ownerAccount?.needs_reauth || missingScopes.length);
  return {
    id: channel.id,
    twitchBroadcasterId: channel.twitch_broadcaster_id,
    twitchLogin: channel.twitch_login,
    displayName: channel.display_name,
    profileImageUrl: channel.profile_image_url,
    role: channel.role,
    isActive: Boolean(channel.is_active),
    needsReauth,
    missingScopes,
    message: needsReauth ? "Нужно повторно войти через Twitch и выдать доступ к чтению чата." : null,
    ingest: {
      status: ingest.status,
      running: ingest.running,
      lastError: ingest.lastError,
    },
  };
}

export function connectMyTwitchChannel(userId, database = getDatabase()) {
  const twitchAccount = findTwitchIdentityByUserId(userId, database);
  if (!twitchAccount) throw new HttpError(409, "A linked Twitch account is required");

  return database.transaction(() => {
    const existing = database.prepare("SELECT * FROM channels WHERE twitch_broadcaster_id = ?").get(twitchAccount.twitch_user_id);
    if (existing?.owner_user_id && existing.owner_user_id !== userId) {
      throw new HttpError(409, "This Twitch channel already has an owner");
    }
    const channel = findOrCreateChannelFromBroadcaster({
      id: twitchAccount.twitch_user_id,
      login: twitchAccount.twitch_login,
      display_name: twitchAccount.twitch_display_name,
      profile_image_url: twitchAccount.profile_image_url,
    }, userId, database);
    database.prepare("UPDATE channels SET owner_user_id = ?, is_active = 1, updated_at = ? WHERE id = ?")
      .run(userId, new Date().toISOString(), channel.id);
    addOrUpdateChannelMembership(channel.id, userId, "channel_owner", database);
    return toChannelContract({ ...channel, owner_user_id: userId, role: "channel_owner" }, database);
  })();
}

export function getMyChannels(userId, database = getDatabase()) {
  return getUserChannels(userId, database).map((channel) => toChannelContract(channel, database));
}
