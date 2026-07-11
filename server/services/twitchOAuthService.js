import { randomBytes, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import process from "node:process";

import { HttpError } from "../middleware/errorHandlers.js";
import { twitchHelixRequest } from "./twitchHelixClient.js";

const TWITCH_AUTHORIZE_URL = "https://id.twitch.tv/oauth2/authorize";
const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const TWITCH_VALIDATE_URL = "https://id.twitch.tv/oauth2/validate";
const STATE_TTL_MS = 10 * 60 * 1000;
export const REQUIRED_TWITCH_OAUTH_SCOPES = ["user:read:chat"];
export const LOCAL_TWITCH_REDIRECT_URI = "http://localhost:3001/auth/twitch/callback";
const pendingStates = new Map();

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new HttpError(503, `Missing ${name}`);
  return value;
}

function getTwitchRedirectUri() {
  const configured = process.env.TWITCH_REDIRECT_URI?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV !== "production") return LOCAL_TWITCH_REDIRECT_URI;
  throw new HttpError(503, "Twitch OAuth is not configured. Missing TWITCH_REDIRECT_URI.");
}

async function readJson(response, fallbackMessage) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new HttpError(502, fallbackMessage);
  return payload;
}

export function createTwitchAuthorization({ forceVerify = false, requestedScopes = [], purpose = null, targetChannelId = null } = {}) {
  for (const [pendingState, context] of pendingStates) {
    if (context.expiresAt <= Date.now()) pendingStates.delete(pendingState);
  }
  const state = randomBytes(32).toString("base64url");
  pendingStates.set(state, {
    expiresAt: Date.now() + STATE_TTL_MS,
    purpose,
    targetChannelId,
  });
  const configuredScopes = String(process.env.TWITCH_OAUTH_SCOPES || "")
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
  const allowedOptionalScopes = new Set(["moderation:read"]);
  const optionalScopes = requestedScopes.filter((scope) => allowedOptionalScopes.has(scope));
  const scopes = [...new Set([...configuredScopes, ...REQUIRED_TWITCH_OAUTH_SCOPES, ...optionalScopes])];
  const query = new URLSearchParams({
    response_type: "code",
    client_id: requiredEnv("TWITCH_CLIENT_ID"),
    redirect_uri: getTwitchRedirectUri(),
    scope: scopes.join(" "),
    state,
  });
  if (forceVerify) query.set("force_verify", "true");
  return { state, url: `${TWITCH_AUTHORIZE_URL}?${query}` };
}

export function consumeTwitchAuthorizationState(queryState, cookieState) {
  if (!queryState || !cookieState) return null;
  const queryBuffer = Buffer.from(String(queryState));
  const cookieStates = Array.isArray(cookieState) ? cookieState : [cookieState];
  let cookieMatches = false;
  for (const candidate of cookieStates) {
    const cookieBuffer = Buffer.from(String(candidate));
    if (queryBuffer.length === cookieBuffer.length && timingSafeEqual(queryBuffer, cookieBuffer)) {
      cookieMatches = true;
      break;
    }
  }
  if (!cookieMatches) return null;
  const context = pendingStates.get(String(queryState));
  pendingStates.delete(String(queryState));
  if (!context || context.expiresAt <= Date.now()) return null;
  return { purpose: context.purpose, targetChannelId: context.targetChannelId };
}

export async function exchangeAuthorizationCode(code) {
  if (!code) throw new HttpError(400, "Missing Twitch authorization code");
  const body = new URLSearchParams({
    client_id: requiredEnv("TWITCH_CLIENT_ID"),
    client_secret: requiredEnv("TWITCH_CLIENT_SECRET"),
    code,
    grant_type: "authorization_code",
    redirect_uri: getTwitchRedirectUri(),
  });
  const response = await fetch(TWITCH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = await readJson(response, "Twitch token exchange failed");
  if (!payload.access_token || !payload.refresh_token) throw new HttpError(502, "Twitch token exchange returned an invalid response");
  return payload;
}

export async function validateOAuthAccessToken(accessToken) {
  const response = await fetch(TWITCH_VALIDATE_URL, { headers: { Authorization: `OAuth ${accessToken}` } });
  const payload = await readJson(response, "Twitch token validation failed");
  if (!payload.user_id) throw new HttpError(502, "Twitch token validation returned an invalid response");
  return payload;
}

export async function fetchAuthenticatedTwitchProfile(accessToken, expectedUserId) {
  const payload = await twitchHelixRequest("/users", { token: accessToken });
  const profile = payload.data?.[0];
  if (!profile || profile.id !== expectedUserId) throw new HttpError(502, "Twitch profile response did not match the authenticated user");
  return profile;
}

export function getOAuthStateCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: STATE_TTL_MS,
    path: "/auth/twitch",
  };
}

export function resetTwitchOAuthStateStore() {
  pendingStates.clear();
}
