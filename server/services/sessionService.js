import { createHash, randomBytes, randomUUID } from "node:crypto";
import process from "node:process";

import * as sessionRepository from "../repositories/sessionRepository.js";

export const SESSION_COOKIE_NAME = "fenya_session";
export const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function hashSessionToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function getSessionCookieOptions(expiresAt) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: new Date(expiresAt),
    path: "/",
  };
}

export function startSession(userId, metadata = {}, ttlMs = DEFAULT_SESSION_TTL_MS, database) {
  const rawToken = randomBytes(32).toString("base64url");
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  const session = sessionRepository.createSession({
    id: randomUUID(), userId, tokenHash: hashSessionToken(rawToken), createdAt, expiresAt,
    userAgent: metadata.userAgent, ipAddress: metadata.ipAddress,
  }, database);
  return { rawToken, session, cookieOptions: getSessionCookieOptions(expiresAt) };
}

export function setSessionCookie(response, rawToken, expiresAt) {
  response.cookie(SESSION_COOKIE_NAME, rawToken, getSessionCookieOptions(expiresAt));
}

export function findSessionByRawToken(rawToken, database) {
  if (!rawToken) return null;
  return sessionRepository.findSessionByTokenHash(hashSessionToken(rawToken), database);
}

export function clearSessionCookie(response) {
  response.clearCookie(SESSION_COOKIE_NAME, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
}
