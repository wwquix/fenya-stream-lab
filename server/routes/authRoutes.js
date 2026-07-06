import { Router } from "express";
import process from "node:process";
import { Buffer } from "node:buffer";

import { HttpError, routeHandler } from "../middleware/errorHandlers.js";
import { findOrCreateChannelFromBroadcaster } from "../repositories/channelRepository.js";
import { addOrUpdateChannelMembership } from "../repositories/membershipRepository.js";
import { deleteSession } from "../repositories/sessionRepository.js";
import { upsertTwitchAccount } from "../repositories/twitchAccountRepository.js";
import { findOrCreateUserFromTwitchProfile } from "../repositories/userRepository.js";
import { clearSessionCookie, setSessionCookie, startSession } from "../services/sessionService.js";
import {
  consumeTwitchAuthorizationState,
  createTwitchAuthorization,
  exchangeAuthorizationCode,
  fetchAuthenticatedTwitchProfile,
  getOAuthStateCookieOptions,
  validateOAuthAccessToken,
} from "../services/twitchOAuthService.js";
import { getIdentitySummary } from "../services/identityService.js";

const router = Router();
const OAUTH_STATE_COOKIE = "fenya_oauth_attempts";
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

function readCookie(req, name) {
  const match = req.headers.cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  if (!match) return null;
  try {
    return decodeURIComponent(match.slice(name.length + 1));
  } catch {
    return null;
  }
}

function readOAuthAttempts(req) {
  try {
    const encoded = readCookie(req, OAUTH_STATE_COOKIE);
    if (!encoded) return [];
    const attempts = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (!Array.isArray(attempts)) return [];
    return attempts.filter((attempt) => (
      typeof attempt?.state === "string"
      && Number(attempt.createdAt) > Date.now() - OAUTH_STATE_TTL_MS
    )).slice(-5);
  } catch {
    return [];
  }
}

function writeOAuthAttempts(res, attempts) {
  if (!attempts.length) {
    res.clearCookie(OAUTH_STATE_COOKIE, getOAuthStateCookieOptions());
    return;
  }
  const encoded = Buffer.from(JSON.stringify(attempts.slice(-5)), "utf8").toString("base64url");
  res.cookie(OAUTH_STATE_COOKIE, encoded, getOAuthStateCookieOptions());
}

function sendOAuthRetryPage(res, { message, retryScope = null, status = 400 }) {
  const retryQuery = new URLSearchParams({ reauth: "1" });
  if (retryScope === "moderation:read") retryQuery.set("scope", retryScope);
  const retryUrl = `/auth/twitch/login?${retryQuery}`;
  res.status(status).type("html").send(`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Twitch OAuth · Fenya Stream Lab</title><body style="margin:0;font-family:system-ui;background:#0b0f14;color:#eef2f7;padding:32px"><main style="max-width:620px;margin:10vh auto;padding:28px;border:1px solid #ffffff1f;border-radius:24px;background:#ffffff0a;box-shadow:0 24px 80px #0008"><p style="margin:0 0 8px;color:#9fb0c0;font-size:13px">Fenya Stream Lab · Twitch OAuth</p><h1 style="margin:0 0 12px;font-size:24px">Нужно повторить подключение</h1><p role="alert" style="margin:0 0 22px;color:#cbd5df;line-height:1.55">${message}</p><a href="${retryUrl}" style="display:inline-block;padding:11px 17px;border-radius:999px;background:#d9ff72;color:#10150b;font-weight:750;text-decoration:none">Повторить подключение Twitch</a><a href="/" style="display:inline-block;margin-left:12px;color:#b8c4cf">Вернуться в дашборд</a></main></body></html>`);
}

function getAuthSuccessRedirectUri() {
  const configured = process.env.APP_BASE_URL?.trim() || process.env.AUTH_SUCCESS_REDIRECT_URI?.trim();
  if (configured) return `${configured.replace(/\/$/, "")}/`;
  return "http://localhost:5173/";
}

router.get("/auth/twitch/login", (req, res) => {
  const wantsJson = req.query.format === "json";
  try {
    const requestedScopes = String(req.query.scope || "").split(/[\s,]+/).filter(Boolean);
    const authorization = createTwitchAuthorization({ forceVerify: req.query.reauth === "1", requestedScopes });
    const attempts = readOAuthAttempts(req);
    attempts.push({
      state: authorization.state,
      createdAt: Date.now(),
      retryScope: requestedScopes.includes("moderation:read") ? "moderation:read" : null,
    });
    writeOAuthAttempts(res, attempts);
    if (wantsJson) {
      res.json({ authorizationUrl: authorization.url });
      return;
    }
    res.redirect(authorization.url);
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 500;
    const message = error instanceof HttpError
      ? error.message
      : "Twitch OAuth could not be started.";
    if (wantsJson) {
      res.status(status).json({ error: true, message });
      return;
    }
    res.status(status).type("html").send(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Twitch OAuth configuration</title><body style="font-family:system-ui;background:#11151c;color:#eef2f7;padding:48px"><main style="max-width:680px;margin:auto;padding:28px;border:1px solid #ffffff1f;border-radius:24px;background:#ffffff0a"><h1 style="margin-top:0">Twitch OAuth could not be started</h1><p>${message}</p><a href="/" style="color:#b9fbc0">Return to Fenya Stream Lab</a></main></body></html>`);
  }
});

router.get("/auth/twitch/callback", async (req, res) => {
  const attempts = readOAuthAttempts(req);
  const matchingAttempt = attempts.find((attempt) => attempt.state === req.query.state) || null;
  const remainingAttempts = attempts.filter((attempt) => attempt.state !== req.query.state);
  writeOAuthAttempts(res, remainingAttempts);
  const stateIsValid = consumeTwitchAuthorizationState(req.query.state, attempts.map((attempt) => attempt.state));
  if (!stateIsValid) {
    sendOAuthRetryPage(res, {
      message: "Сессия авторизации Twitch истекла. Повторите подключение.",
      retryScope: matchingAttempt?.retryScope,
    });
    return;
  }
  if (req.query.error) {
    sendOAuthRetryPage(res, { message: "Авторизация Twitch была отменена. Повторите вход.", retryScope: matchingAttempt?.retryScope });
    return;
  }

  try {
    const tokens = await exchangeAuthorizationCode(req.query.code);
    const validation = await validateOAuthAccessToken(tokens.access_token);
    const profile = await fetchAuthenticatedTwitchProfile(tokens.access_token, validation.user_id);
    const user = findOrCreateUserFromTwitchProfile(profile);
    const expiresAt = new Date(Date.now() + Number(tokens.expires_in || validation.expires_in || 0) * 1000).toISOString();
    upsertTwitchAccount(user.id, profile, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      scopes: Array.isArray(validation.scopes) ? validation.scopes : tokens.scope ?? [],
      expiresAt,
    });
    const channel = findOrCreateChannelFromBroadcaster(profile, user.id);
    addOrUpdateChannelMembership(channel.id, user.id, "channel_owner");

    const { rawToken, session } = startSession(user.id, {
      userAgent: req.get("user-agent") || null,
      ipAddress: req.ip || null,
    });
    setSessionCookie(res, rawToken, session.expires_at);
    res.redirect(getAuthSuccessRedirectUri());
  } catch {
    sendOAuthRetryPage(res, {
      status: 502,
      message: "Не удалось завершить авторизацию Twitch. Повторите вход.",
      retryScope: matchingAttempt?.retryScope,
    });
  }
});

router.post("/auth/logout", routeHandler(async (req, res) => {
  if (req.session) deleteSession(req.session.id);
  clearSessionCookie(res);
  res.status(204).end();
}, "Logout failed"));

router.get("/api/me", routeHandler(async (req, res) => {
  res.json(getIdentitySummary(req.user));
}, "Could not load current user"));

export default router;
