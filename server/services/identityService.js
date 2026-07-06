import process from "node:process";

import { getUserChannels } from "../repositories/channelRepository.js";
import { getUserMemberships } from "../repositories/membershipRepository.js";
import { findTwitchIdentityByUserId } from "../repositories/twitchAccountRepository.js";
import { getDatabase } from "../storage/db.js";

function configuredPlatformAdmin(identity) {
  if (!identity) return false;
  const ids = new Set(String(process.env.PLATFORM_ADMIN_TWITCH_IDS || "").split(",").map((value) => value.trim()).filter(Boolean));
  const logins = new Set(String(process.env.PLATFORM_ADMIN_TWITCH_LOGINS || "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean));
  return ids.has(identity.twitch_user_id) || logins.has(identity.twitch_login.toLowerCase());
}

function channelContract(channel) {
  return {
    id: channel.id,
    twitchBroadcasterId: channel.twitch_broadcaster_id,
    twitchLogin: channel.twitch_login,
    displayName: channel.display_name,
    profileImageUrl: channel.profile_image_url,
    role: channel.role,
  };
}

export function getIdentitySummary(user, database = getDatabase()) {
  if (!user) {
    return {
      isLoggedIn: false, user: null, twitchAccount: null, ownedChannels: [], memberships: [], globalRoles: [],
      roleSummary: {
        isGuest: true, isChatter: false, isChannelOwner: false, isChannelAdmin: false,
        isModerator: false, isPlatformAdmin: false,
      },
      chatterProfiles: [],
    };
  }
  const identity = findTwitchIdentityByUserId(user.id, database);
  const memberships = getUserMemberships(user.id, database);
  const channels = getUserChannels(user.id, database);
  const chatterProfiles = identity ? database.prepare(`
    SELECT streams.channel_id, channels.twitch_login AS channel_login,
      chatters.nickname, SUM(chatters.message_count) AS message_count
    FROM chatters JOIN streams ON streams.stream_id = chatters.stream_id
    LEFT JOIN channels ON channels.id = streams.channel_id
    WHERE chatters.nickname = ? COLLATE NOCASE
    GROUP BY streams.channel_id, channels.twitch_login, chatters.nickname
    ORDER BY message_count DESC
  `).all(identity.twitch_login).map((row) => ({
    channelId: row.channel_id,
    channelLogin: row.channel_login,
    nickname: row.nickname,
    messageCount: row.message_count,
  })) : [];
  const roles = new Set(memberships.map((membership) => membership.role));
  const isSyncedModerator = identity ? Boolean(database.prepare(`
    SELECT 1 FROM channel_moderators WHERE twitch_user_id = ? LIMIT 1
  `).get(identity.twitch_user_id)) : false;
  const isPlatformAdmin = configuredPlatformAdmin(identity);
  return {
    isLoggedIn: true,
    user: { id: user.id, displayName: user.displayName, avatarUrl: user.avatarUrl },
    twitchAccount: identity ? {
      twitchUserId: identity.twitch_user_id,
      login: identity.twitch_login,
      displayName: identity.twitch_display_name,
      profileImageUrl: identity.profile_image_url,
    } : null,
    ownedChannels: channels.filter((channel) => channel.role === "channel_owner").map(channelContract),
    memberships: memberships.map((membership) => ({
      id: membership.id,
      channelId: membership.channel_id,
      role: membership.role,
      channelLogin: membership.twitch_login,
      channelDisplayName: membership.display_name,
    })),
    globalRoles: isPlatformAdmin ? ["platform_admin"] : [],
    roleSummary: {
      isGuest: false,
      isChatter: true,
      isChannelOwner: roles.has("channel_owner"),
      isChannelAdmin: roles.has("channel_admin"),
      isModerator: roles.has("moderator") || isSyncedModerator,
      isPlatformAdmin,
    },
    chatterProfiles,
  };
}
