import { getDatabase } from "../storage/db.js";

export function findOrCreateChannelFromBroadcaster(broadcaster, ownerUserId = null, database = getDatabase()) {
  const broadcasterId = String(broadcaster.id ?? broadcaster.broadcaster_id ?? "").trim();
  if (!broadcasterId) throw new TypeError("Twitch broadcaster id is required");
  const now = new Date().toISOString();
  database.prepare(`
    INSERT INTO channels (
      twitch_broadcaster_id, twitch_login, display_name, profile_image_url,
      owner_user_id, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT(twitch_broadcaster_id) DO UPDATE SET
      twitch_login = excluded.twitch_login,
      display_name = excluded.display_name,
      profile_image_url = excluded.profile_image_url,
      owner_user_id = COALESCE(excluded.owner_user_id, channels.owner_user_id),
      is_active = 1,
      updated_at = excluded.updated_at
  `).run(
    broadcasterId, broadcaster.login || "", broadcaster.display_name || broadcaster.login || "",
    broadcaster.profile_image_url || null, ownerUserId, now, now,
  );
  return database.prepare("SELECT * FROM channels WHERE twitch_broadcaster_id = ?").get(broadcasterId);
}

export function getUserChannels(userId, database = getDatabase()) {
  return database.prepare(`
    SELECT channels.*, channel_memberships.role
    FROM channels JOIN channel_memberships ON channel_memberships.channel_id = channels.id
    WHERE channel_memberships.user_id = ? AND channels.is_active = 1
    ORDER BY channels.display_name COLLATE NOCASE
  `).all(userId);
}

export function findChannelById(channelId, database = getDatabase()) {
  return database.prepare("SELECT * FROM channels WHERE id = ? AND is_active = 1").get(channelId) ?? null;
}

export function findChannelByBroadcasterId(broadcasterId, database = getDatabase()) {
  return database.prepare("SELECT * FROM channels WHERE twitch_broadcaster_id = ?").get(broadcasterId) ?? null;
}

export function findChannelByLogin(login, database = getDatabase()) {
  return database.prepare("SELECT * FROM channels WHERE twitch_login = ? COLLATE NOCASE").get(login) ?? null;
}
