import process from "node:process";

import { HttpError } from "../middleware/errorHandlers.js";
import {
  findTwitchAccountById,
  findTwitchAccountsExpiringBy,
  markTwitchAccountNeedsReauth,
  updateTwitchAccountEncryptedTokens,
} from "../repositories/twitchAccountRepository.js";
import { decryptToken, encryptToken, TokenCryptoConfigError } from "./tokenCryptoService.js";
import { fetchTwitch } from "./twitchHttpService.js";

const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const EXPIRING_SOON_MS = 10 * 60 * 1000;
const DEFAULT_REFRESH_INTERVAL_MS = 300_000;
const refreshesInFlight = new Map();
let refreshTimer = null;

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new HttpError(503, `Missing ${name}`);
  return value;
}

function parseScopes(scopesJson) {
  try {
    const scopes = JSON.parse(scopesJson || "[]");
    return Array.isArray(scopes) ? scopes : [];
  } catch {
    return [];
  }
}

async function performRefresh(twitchAccountId) {
  const account = findTwitchAccountById(twitchAccountId);
  if (!account) throw new HttpError(404, "Twitch account not found");
  if (!account.refresh_token_encrypted) {
    markTwitchAccountNeedsReauth(twitchAccountId);
    throw new HttpError(401, "Twitch account requires reauthorization");
  }

  let refreshToken;
  try {
    refreshToken = decryptToken(account.refresh_token_encrypted);
  } catch (error) {
    if (error instanceof TokenCryptoConfigError) throw error;
    markTwitchAccountNeedsReauth(twitchAccountId);
    throw new HttpError(401, "Twitch account requires reauthorization", { cause: error });
  }

  try {
    const body = new URLSearchParams({
      client_id: requiredEnv("TWITCH_CLIENT_ID"),
      client_secret: requiredEnv("TWITCH_CLIENT_SECRET"),
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
    const response = await fetchTwitch(TWITCH_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.access_token) throw new Error("Twitch rejected the refresh request");

    const rotatedRefreshToken = payload.refresh_token || refreshToken;
    const expiresAt = new Date(Date.now() + Number(payload.expires_in || 0) * 1000).toISOString();
    updateTwitchAccountEncryptedTokens(twitchAccountId, {
      accessTokenEncrypted: encryptToken(payload.access_token),
      refreshTokenEncrypted: encryptToken(rotatedRefreshToken),
      scopes: Array.isArray(payload.scope) ? payload.scope : parseScopes(account.scopes_json),
      expiresAt,
    });
    return payload.access_token;
  } catch (error) {
    if (error instanceof TokenCryptoConfigError) throw error;
    markTwitchAccountNeedsReauth(twitchAccountId);
    throw new HttpError(401, "Twitch account requires reauthorization", { cause: error });
  }
}

export function refreshTwitchAccountToken(twitchAccountId) {
  const key = String(twitchAccountId);
  if (refreshesInFlight.has(key)) return refreshesInFlight.get(key);
  const refresh = performRefresh(twitchAccountId).finally(() => refreshesInFlight.delete(key));
  refreshesInFlight.set(key, refresh);
  return refresh;
}

export async function refreshTokensExpiringSoon() {
  const expiresBy = new Date(Date.now() + EXPIRING_SOON_MS).toISOString();
  const accounts = findTwitchAccountsExpiringBy(expiresBy);
  const results = await Promise.allSettled(accounts.map((account) => refreshTwitchAccountToken(account.id)));
  return {
    checked: accounts.length,
    refreshed: results.filter((result) => result.status === "fulfilled").length,
    failed: results.filter((result) => result.status === "rejected").length,
  };
}

export async function getValidUserAccessTokenForAccount(twitchAccountId) {
  const account = findTwitchAccountById(twitchAccountId);
  if (!account) throw new HttpError(404, "Twitch account not found");
  if (account.needs_reauth) throw new HttpError(401, "Twitch account requires reauthorization");
  if (!account.access_token_encrypted) throw new HttpError(401, "Twitch account requires reauthorization");

  const expiresSoon = !account.expires_at || new Date(account.expires_at).getTime() <= Date.now() + EXPIRING_SOON_MS;
  if (expiresSoon) return refreshTwitchAccountToken(twitchAccountId);
  return decryptToken(account.access_token_encrypted);
}

export function startTwitchTokenRefreshJob() {
  if (refreshTimer || String(process.env.TWITCH_TOKEN_REFRESH_ENABLED).toLowerCase() !== "true") {
    return { running: Boolean(refreshTimer) };
  }
  const configuredInterval = Number(process.env.TWITCH_TOKEN_REFRESH_INTERVAL_MS || DEFAULT_REFRESH_INTERVAL_MS);
  const intervalMs = Number.isFinite(configuredInterval) && configuredInterval >= 1000
    ? configuredInterval
    : DEFAULT_REFRESH_INTERVAL_MS;
  const runSafely = () => refreshTokensExpiringSoon()
    .then((result) => {
      if (result.failed > 0) console.error(`Twitch token refresh failed for ${result.failed} account(s)`);
    })
    .catch((error) => {
      console.error("Twitch token refresh cycle failed:", error.message);
    });
  refreshTimer = setInterval(runSafely, intervalMs);
  refreshTimer.unref?.();
  void runSafely();
  return { running: true, intervalMs };
}

export function stopTwitchTokenRefreshJob() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = null;
}

export async function shutdownTwitchTokenRefreshJob() {
  stopTwitchTokenRefreshJob();
  await Promise.allSettled([...refreshesInFlight.values()]);
}
