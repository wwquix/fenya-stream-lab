import { getDatabase } from "../storage/db.js";

export function findOrCreateUserFromTwitchProfile(profile, database = getDatabase()) {
  const twitchUserId = String(profile.id ?? profile.user_id ?? "").trim();
  if (!twitchUserId) throw new TypeError("Twitch profile id is required");

  const existing = database.prepare(`
    SELECT users.* FROM users
    JOIN twitch_accounts ON twitch_accounts.user_id = users.id
    WHERE twitch_accounts.twitch_user_id = ?
  `).get(twitchUserId);
  const now = new Date().toISOString();
  if (existing) {
    database.prepare(`UPDATE users SET display_name = ?, avatar_url = ?, last_login_at = ? WHERE id = ?`).run(
      profile.display_name || profile.login || existing.display_name,
      profile.profile_image_url || existing.avatar_url,
      now,
      existing.id,
    );
    return database.prepare("SELECT * FROM users WHERE id = ?").get(existing.id);
  }

  return database.transaction(() => {
    const result = database.prepare(`
      INSERT INTO users (display_name, avatar_url, created_at, last_login_at) VALUES (?, ?, ?, ?)
    `).run(profile.display_name || profile.login || "Twitch user", profile.profile_image_url || null, now, now);
    database.prepare(`
      INSERT INTO twitch_accounts (
        user_id, twitch_user_id, twitch_login, twitch_display_name, profile_image_url, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      result.lastInsertRowid, twitchUserId, profile.login || "",
      profile.display_name || profile.login || "", profile.profile_image_url || null, now, now,
    );
    return database.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid);
  })();
}
