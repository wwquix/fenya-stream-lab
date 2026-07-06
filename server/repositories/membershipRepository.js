import { getDatabase } from "../storage/db.js";

export const CHANNEL_ROLES = Object.freeze(["channel_owner", "channel_admin", "moderator", "chatter"]);

export function addOrUpdateChannelMembership(channelId, userId, role, database = getDatabase()) {
  if (!CHANNEL_ROLES.includes(role)) throw new TypeError(`Invalid channel role: ${role}`);
  database.prepare(`
    INSERT INTO channel_memberships (channel_id, user_id, role)
    VALUES (?, ?, ?)
    ON CONFLICT(channel_id, user_id) DO UPDATE SET role = excluded.role
  `).run(channelId, userId, role);
  return database.prepare("SELECT * FROM channel_memberships WHERE channel_id = ? AND user_id = ?").get(channelId, userId);
}

export function getUserChannelRole(channelId, userId, database = getDatabase()) {
  return database.prepare("SELECT role FROM channel_memberships WHERE channel_id = ? AND user_id = ?").get(channelId, userId)?.role ?? null;
}

export function getUserMemberships(userId, database = getDatabase()) {
  return database.prepare(`
    SELECT channel_memberships.id, channel_memberships.channel_id, channel_memberships.user_id,
      channel_memberships.role, channel_memberships.created_at,
      channels.twitch_login, channels.display_name
    FROM channel_memberships JOIN channels ON channels.id = channel_memberships.channel_id
    WHERE channel_memberships.user_id = ? AND channels.is_active = 1
    ORDER BY channels.display_name COLLATE NOCASE
  `).all(userId);
}
