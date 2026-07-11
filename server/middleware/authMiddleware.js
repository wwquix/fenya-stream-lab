import { CHANNEL_ROLES, getUserChannelRole } from "../repositories/membershipRepository.js";
import process from "node:process";
import { findTwitchIdentityByUserId } from "../repositories/twitchAccountRepository.js";
import { findSessionByRawToken, SESSION_COOKIE_NAME } from "../services/sessionService.js";
import { userIsPlatformAdmin } from "../services/identityService.js";
import { getDatabase } from "../storage/db.js";
import { HttpError } from "./errorHandlers.js";

function readCookie(cookieHeader, name) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim()) || null;
    } catch {
      return null;
    }
  }
  return null;
}

function unauthorized(res) {
  return res.status(401).json({ error: "unauthorized", message: "Authentication required" });
}

function forbidden(res) {
  return res.status(403).json({ error: "forbidden", message: "Insufficient permissions" });
}

function userOwnsChannel(userId, channelId, database = getDatabase()) {
  return database.prepare(`
    SELECT 1 FROM channel_memberships
    WHERE user_id = ? AND channel_id = ? AND role = 'channel_owner'
  `).get(userId, channelId) !== undefined;
}

function userOwnsAnyChannel(userId, database = getDatabase()) {
  return database.prepare(`
    SELECT 1 FROM channel_memberships WHERE user_id = ? AND role = 'channel_owner' LIMIT 1
  `).get(userId) !== undefined;
}

function userIsLinkedIngestAccount(userId, channelId, database = getDatabase()) {
  return database.prepare(`
    SELECT 1
    FROM channels
    JOIN twitch_accounts ON twitch_accounts.id = channels.ingest_twitch_account_id
    WHERE channels.id = ? AND twitch_accounts.user_id = ?
  `).get(channelId, userId) !== undefined;
}

function validateRoles(roles) {
  if (!Array.isArray(roles) || roles.length === 0 || roles.some((role) => !CHANNEL_ROLES.includes(role))) {
    throw new TypeError("A non-empty list of valid channel roles is required");
  }
  return new Set(roles);
}

export function attachCurrentUser(req, _res, next) {
  req.user = null;
  req.session = null;
  const rawToken = readCookie(req.headers.cookie, SESSION_COOKIE_NAME);
  if (!rawToken) {
    next();
    return;
  }

  try {
    const session = findSessionByRawToken(rawToken);
    if (session) {
      req.session = {
        id: session.id,
        userId: session.user_id,
        createdAt: session.created_at,
        expiresAt: session.expires_at,
        userAgent: session.user_agent,
        ipAddress: session.ip_address,
      };
      req.user = {
        id: session.user_id,
        displayName: session.display_name,
        avatarUrl: session.avatar_url,
      };
    }
  } catch {
    // Authentication lookup failures are treated as an invalid guest session.
  }
  next();
}

export function requireUser(req, res, next) {
  if (!req.user) {
    unauthorized(res);
    return;
  }
  next();
}

export function requireChannelRole(roles) {
  const allowedRoles = validateRoles(roles);
  return function channelRoleGuard(req, res, next) {
    if (!req.user) {
      unauthorized(res);
      return;
    }
    try {
      if (userIsPlatformAdmin(req.user.id)) {
        req.globalRole = "platform_admin";
        next();
        return;
      }
      const role = getUserChannelRole(req.params.channelId, req.user.id);
      if (!role || !allowedRoles.has(role)) {
        forbidden(res);
        return;
      }
      req.channelRole = role;
      next();
    } catch (error) {
      next(new HttpError(500, "Authorization unavailable", { cause: error }));
    }
  };
}

export function requireApiMutationPermission(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    next();
    return;
  }
  if (!req.user) {
    unauthorized(res);
    return;
  }

  try {
    if (userIsPlatformAdmin(req.user.id)) {
      req.globalRole = "platform_admin";
      next();
      return;
    }

    const channelMatch = req.path.match(/^\/channels\/(\d+)(?:\/|$)/);
    if (channelMatch && userOwnsChannel(req.user.id, Number(channelMatch[1]))) {
      req.channelRole = "channel_owner";
      next();
      return;
    }

    if (req.path === "/channels/connect-my-channel" && userOwnsAnyChannel(req.user.id)) {
      req.channelRole = "channel_owner";
      next();
      return;
    }

    if (req.path.startsWith("/twitch/fenya/")) {
      const login = process.env.TWITCH_CHANNEL_LOGIN?.trim() || "fenya";
      const channel = getDatabase().prepare("SELECT id FROM channels WHERE twitch_login = ? COLLATE NOCASE").get(login);
      const ownsChannel = channel && userOwnsChannel(req.user.id, channel.id);
      const isIngestControlRoute = /^\/twitch\/fenya\/ingest\/(?:start|stop)$/.test(req.path);
      const isLinkedReader = channel && isIngestControlRoute && userIsLinkedIngestAccount(req.user.id, channel.id);
      if (ownsChannel || isLinkedReader) {
        req.channelRole = ownsChannel ? "channel_owner" : "ingest_reader";
        next();
        return;
      }
    }

    forbidden(res);
  } catch (error) {
    next(new HttpError(500, "Authorization unavailable", { cause: error }));
  }
}

export function requireSelfOrChannelRole({ roles, twitchUserIdParam = "twitchUserId" }) {
  const allowedRoles = validateRoles(roles);
  return function selfOrChannelRoleGuard(req, res, next) {
    if (!req.user) {
      unauthorized(res);
      return;
    }

    try {
      const identity = findTwitchIdentityByUserId(req.user.id);
      if (identity?.twitch_user_id === req.params[twitchUserIdParam]) {
        req.isSelf = true;
        next();
        return;
      }

      const role = getUserChannelRole(req.params.channelId, req.user.id);
      if (!role || !allowedRoles.has(role)) {
        forbidden(res);
        return;
      }
      req.isSelf = false;
      req.channelRole = role;
      next();
    } catch (error) {
      next(new HttpError(500, "Authorization unavailable", { cause: error }));
    }
  };
}
