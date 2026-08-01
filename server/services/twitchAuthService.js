import process from "node:process";

import { HttpError } from "../middleware/errorHandlers.js";
import { fetchTwitch } from "./twitchHttpService.js";

const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const TWITCH_VALIDATE_URL = "https://id.twitch.tv/oauth2/validate";
const EXPIRY_MARGIN_MS = 60_000;

let appTokenCache = null;
let refreshedUserToken = null;

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new HttpError(503, `Missing ${name}`);
  return value;
}

async function readJson(response, fallbackMessage) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new HttpError(502, payload.message || fallbackMessage);
  }
  return payload;
}

export async function getAppAccessToken() {
  if (appTokenCache?.expiresAt > Date.now() + EXPIRY_MARGIN_MS) return appTokenCache.token;

  const clientId = requiredEnv("TWITCH_CLIENT_ID");
  const clientSecret = requiredEnv("TWITCH_CLIENT_SECRET");
  const query = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "client_credentials" });
  const response = await fetchTwitch(`${TWITCH_TOKEN_URL}?${query}`, { method: "POST" });
  const payload = await readJson(response, "Twitch app token request failed");

  appTokenCache = {
    token: payload.access_token,
    expiresAt: Date.now() + Number(payload.expires_in || 0) * 1000,
  };
  return appTokenCache.token;
}

export function getConfiguredUserToken() {
  return refreshedUserToken?.token || process.env.TWITCH_USER_ACCESS_TOKEN?.trim() || null;
}

export async function refreshUserAccessToken() {
  const clientId = requiredEnv("TWITCH_CLIENT_ID");
  const clientSecret = requiredEnv("TWITCH_CLIENT_SECRET");
  const refreshToken = refreshedUserToken?.refreshToken || process.env.TWITCH_REFRESH_TOKEN?.trim();
  if (!refreshToken) throw new HttpError(503, "Missing TWITCH_REFRESH_TOKEN");

  const query = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const response = await fetchTwitch(`${TWITCH_TOKEN_URL}?${query}`, { method: "POST" });
  const payload = await readJson(response, "Twitch user token refresh failed");
  refreshedUserToken = {
    token: payload.access_token,
    refreshToken: payload.refresh_token || refreshToken,
  };
  return payload.access_token;
}

export async function validateUserToken() {
  const token = getConfiguredUserToken();
  if (!token) return null;

  const response = await fetchTwitch(TWITCH_VALIDATE_URL, { headers: { Authorization: `OAuth ${token}` } });
  const payload = await readJson(response, "Twitch user token validation failed");
  return {
    user_id: payload.user_id ?? null,
    login: payload.login ?? null,
    scopes: Array.isArray(payload.scopes) ? payload.scopes : [],
    expires_in: payload.expires_in ?? null,
  };
}

export function resetTwitchAuthCache() {
  appTokenCache = null;
  refreshedUserToken = null;
}
