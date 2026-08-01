import { getDatabase } from "../storage/db.js";

export function createSession(session, database = getDatabase()) {
  database.prepare(`
    INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, user_agent, ip_address)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(session.id, session.userId, session.tokenHash, session.createdAt, session.expiresAt, session.userAgent ?? null, session.ipAddress ?? null);
  return database.prepare("SELECT * FROM sessions WHERE id = ?").get(session.id);
}

export function findSessionByTokenHash(tokenHash, database = getDatabase()) {
  const now = new Date().toISOString();
  return database.transaction(() => {
    database.prepare("DELETE FROM sessions WHERE token_hash = ? AND expires_at <= ?").run(tokenHash, now);
    return database.prepare(`
      SELECT sessions.*, users.display_name, users.avatar_url
      FROM sessions JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?
    `).get(tokenHash, now) ?? null;
  })();
}

export function deleteSession(id, database = getDatabase()) {
  return database.prepare("DELETE FROM sessions WHERE id = ?").run(id).changes > 0;
}

export function deleteUserSessions(userId, database = getDatabase()) {
  return database.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId).changes;
}
