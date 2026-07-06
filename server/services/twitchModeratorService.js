import process from "node:process";

import { findChannelById, findChannelByLogin, findOrCreateChannelFromBroadcaster } from "../repositories/channelRepository.js";
import { listChannelModerators, syncChannelModerators } from "../repositories/channelModeratorRepository.js";
import { findTwitchAccountByUserId } from "../repositories/twitchAccountRepository.js";
import { getConfiguredUserToken, validateUserToken } from "./twitchAuthService.js";
import { twitchHelixRequest } from "./twitchHelixClient.js";
import { loadTwitchChannelMetadata } from "./twitchMetadataService.js";

export const MODERATOR_SCOPE = "moderation:read";
const MISSING_SCOPE_MESSAGE = "Для списка модераторов нужен scope moderation:read.";

function parseScopes(value) {
  try {
    const scopes = JSON.parse(value || "[]");
    return Array.isArray(scopes) ? scopes : [];
  } catch {
    return [];
  }
}

function contract(channelId, scopes, moderators) {
  const available = scopes.includes(MODERATOR_SCOPE);
  return {
    available,
    missingScopes: available ? [] : [MODERATOR_SCOPE],
    message: available ? null : MISSING_SCOPE_MESSAGE,
    moderators,
    channelId,
  };
}

async function fetchModerators(broadcasterId, auth) {
  const moderators = [];
  const seenCursors = new Set();
  let cursor = null;
  for (let page = 0; page < 10; page += 1) {
    const query = new URLSearchParams({ broadcaster_id: String(broadcasterId), first: "100" });
    if (cursor) query.set("after", cursor);
    const payload = await twitchHelixRequest(`/moderation/moderators?${query}`, auth);
    moderators.push(...(payload.data || []));
    const nextCursor = payload.pagination?.cursor;
    if (!nextCursor || seenCursors.has(nextCursor)) break;
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }
  return moderators;
}

async function legacyContext() {
  const login = process.env.TWITCH_CHANNEL_LOGIN?.trim() || "fenya";
  let channel = findChannelByLogin(login);
  if (!channel) {
    const metadata = await loadTwitchChannelMetadata(login);
    if (!metadata.broadcasterId) return { channel: null, scopes: [], auth: null };
    channel = findOrCreateChannelFromBroadcaster({
      id: metadata.broadcasterId,
      login: metadata.channelLogin || login,
      display_name: metadata.displayName || login,
      profile_image_url: metadata.profileImageUrl || null,
    });
  }
  const tokenInfo = await validateUserToken().catch(() => null);
  return { channel, scopes: tokenInfo?.scopes || [], auth: getConfiguredUserToken() ? { token: getConfiguredUserToken() } : null };
}

function channelContext(channelId) {
  const channel = findChannelById(channelId);
  if (!channel) return null;
  const account = channel.owner_user_id ? findTwitchAccountByUserId(channel.owner_user_id) : null;
  return { channel, scopes: parseScopes(account?.scopes_json), auth: account ? { twitchAccountId: account.id } : null };
}

export async function getLegacyModeratorDirectory({ sync = false } = {}) {
  const context = await legacyContext();
  if (!context.channel) return contract(null, context.scopes, []);
  if (sync && context.scopes.includes(MODERATOR_SCOPE) && context.auth) {
    const rows = await fetchModerators(context.channel.twitch_broadcaster_id, context.auth);
    syncChannelModerators(context.channel.id, rows);
  }
  return contract(context.channel.id, context.scopes, listChannelModerators(context.channel.id));
}

export async function getChannelModeratorDirectory(channelId, { sync = false } = {}) {
  const context = channelContext(channelId);
  if (!context) return null;
  if (sync && context.scopes.includes(MODERATOR_SCOPE) && context.auth) {
    const rows = await fetchModerators(context.channel.twitch_broadcaster_id, context.auth);
    syncChannelModerators(context.channel.id, rows);
  }
  return contract(context.channel.id, context.scopes, listChannelModerators(context.channel.id));
}
