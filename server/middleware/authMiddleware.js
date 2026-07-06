import { CHANNEL_ROLES, getUserChannelRole } from "../repositories/membershipRepository.js";
import { findTwitchIdentityByUserId } from "../repositories/twitchAccountRepository.js";
import { findSessionByRawToken, SESSION_COOKIE_NAME } from "../services/sessionService.js";
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
  return res.status(401).json({ error: true, message: "Authentication required" });
}

function forbidden(res) {
  return res.status(403).json({ error: true, message: "Insufficient channel permissions" });
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
