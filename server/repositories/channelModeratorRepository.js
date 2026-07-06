import { getDatabase } from "../storage/db.js";

function toContract(row) {
  return {
    twitchUserId: row.twitch_user_id,
    login: row.login,
    displayName: row.display_name,
    syncedAt: row.synced_at,
  };
}

export function listChannelModerators(channelId, database = getDatabase()) {
  return database.prepare(`
    SELECT twitch_user_id, login, display_name, synced_at
    FROM channel_moderators WHERE channel_id = ?
    ORDER BY display_name COLLATE NOCASE, login COLLATE NOCASE
  `).all(channelId).map(toContract);
}

export function syncChannelModerators(channelId, moderators, database = getDatabase()) {
  const syncedAt = new Date().toISOString();
  database.transaction(() => {
    const ids = moderators.map((moderator) => String(moderator.user_id || moderator.id || "")).filter(Boolean);
    if (ids.length) {
      const placeholders = ids.map(() => "?").join(", ");
      database.prepare(`DELETE FROM channel_moderators WHERE channel_id = ? AND twitch_user_id NOT IN (${placeholders})`)
        .run(channelId, ...ids);
    } else {
      database.prepare("DELETE FROM channel_moderators WHERE channel_id = ?").run(channelId);
    }
    const upsert = database.prepare(`
      INSERT INTO channel_moderators (channel_id, twitch_user_id, login, display_name, synced_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(channel_id, twitch_user_id) DO UPDATE SET
        login = excluded.login, display_name = excluded.display_name, synced_at = excluded.synced_at
    `);
    for (const moderator of moderators) {
      const id = String(moderator.user_id || moderator.id || "").trim();
      if (!id) continue;
      upsert.run(channelId, id, moderator.user_login || moderator.login || "", moderator.user_name || moderator.display_name || moderator.user_login || "", syncedAt);
    }
  })();
  return listChannelModerators(channelId, database);
}
