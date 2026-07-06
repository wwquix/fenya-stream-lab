import { getDatabase } from "../storage/db.js";
import { encryptToken } from "../services/tokenCryptoService.js";

export function upsertTwitchAccount(userId, profile, tokens = {}, database = getDatabase()) {
  const twitchUserId = String(profile.id ?? profile.user_id ?? "").trim();
  if (!twitchUserId) throw new TypeError("Twitch profile id is required");
  const now = new Date().toISOString();
  const accessTokenEncrypted = tokens.accessToken ? encryptToken(tokens.accessToken) : null;
  const refreshTokenEncrypted = tokens.refreshToken ? encryptToken(tokens.refreshToken) : null;

  database.prepare(`
    INSERT INTO twitch_accounts (
      user_id, twitch_user_id, twitch_login, twitch_display_name, profile_image_url,
      access_token_encrypted, refresh_token_encrypted, scopes_json, expires_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(twitch_user_id) DO UPDATE SET
      user_id = excluded.user_id,
      twitch_login = excluded.twitch_login,
      twitch_display_name = excluded.twitch_display_name,
      profile_image_url = excluded.profile_image_url,
      access_token_encrypted = COALESCE(excluded.access_token_encrypted, twitch_accounts.access_token_encrypted),
      refresh_token_encrypted = COALESCE(excluded.refresh_token_encrypted, twitch_accounts.refresh_token_encrypted),
      scopes_json = excluded.scopes_json,
      expires_at = excluded.expires_at,
      needs_reauth = 0,
      updated_at = excluded.updated_at
  `).run(
    userId, twitchUserId, profile.login || "", profile.display_name || profile.login || "",
    profile.profile_image_url || null, accessTokenEncrypted, refreshTokenEncrypted,
    JSON.stringify(tokens.scopes ?? []), tokens.expiresAt ?? null, now, now,
  );
  return database.prepare(`
    SELECT id, user_id, twitch_user_id, twitch_login, twitch_display_name, profile_image_url,
      scopes_json, expires_at, created_at, updated_at
    FROM twitch_accounts WHERE twitch_user_id = ?
  `).get(twitchUserId);
}

export function findTwitchAccountWithEncryptedTokens(userId, database = getDatabase()) {
  return database.prepare("SELECT * FROM twitch_accounts WHERE user_id = ?").get(userId) ?? null;
}

export function findTwitchIdentityByUserId(userId, database = getDatabase()) {
  return database.prepare(`
    SELECT id, user_id, twitch_user_id, twitch_login, twitch_display_name, profile_image_url
    FROM twitch_accounts WHERE user_id = ?
  `).get(userId) ?? null;
}

export function findTwitchAccountByUserId(userId, database = getDatabase()) {
  return database.prepare("SELECT * FROM twitch_accounts WHERE user_id = ?").get(userId) ?? null;
}

export function findTwitchAccountById(id, database = getDatabase()) {
  return database.prepare("SELECT * FROM twitch_accounts WHERE id = ?").get(id) ?? null;
}

export function findTwitchAccountsExpiringBy(expiresBy, database = getDatabase()) {
  return database.prepare(`
    SELECT * FROM twitch_accounts
    WHERE needs_reauth = 0
      AND access_token_encrypted IS NOT NULL
      AND refresh_token_encrypted IS NOT NULL
      AND (expires_at IS NULL OR expires_at <= ?)
    ORDER BY id
  `).all(expiresBy);
}

export function updateTwitchAccountEncryptedTokens(id, values, database = getDatabase()) {
  database.prepare(`
    UPDATE twitch_accounts SET
      access_token_encrypted = ?, refresh_token_encrypted = ?, scopes_json = ?,
      expires_at = ?, needs_reauth = 0, updated_at = ?
    WHERE id = ?
  `).run(
    values.accessTokenEncrypted,
    values.refreshTokenEncrypted,
    JSON.stringify(values.scopes ?? []),
    values.expiresAt,
    new Date().toISOString(),
    id,
  );
  return findTwitchAccountById(id, database);
}

export function markTwitchAccountNeedsReauth(id, database = getDatabase()) {
  return database.prepare(`
    UPDATE twitch_accounts SET needs_reauth = 1, updated_at = ? WHERE id = ?
  `).run(new Date().toISOString(), id).changes > 0;
}
