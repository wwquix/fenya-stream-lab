import process from "node:process";

import { findChannelByLogin } from "../repositories/channelRepository.js";
import { findTwitchAccountById, getSafeTwitchAccountStatus } from "../repositories/twitchAccountRepository.js";
import { getAppAccessToken, getConfiguredUserToken, validateUserToken } from "./twitchAuthService.js";
import { getTwitchProviderName } from "./twitchMetadataService.js";

function parseScopes(value) {
  try {
    const scopes = JSON.parse(value || "[]");
    return Array.isArray(scopes) ? scopes : [];
  } catch {
    return [];
  }
}

function databaseTokenStatus(account) {
  if (!account) return "not_connected";
  if (account.needs_reauth || !account.has_access_token || !account.has_refresh_token) return "reauthorization_required";
  if (!account.expires_at || new Date(account.expires_at).getTime() <= Date.now()) return "refresh_required";
  return "valid";
}

function legacyDevelopmentMode() {
  return process.env.NODE_ENV !== "production"
    && String(process.env.TWITCH_LEGACY_ENV_TOKEN_MODE || "").trim().toLowerCase() === "true";
}

export async function getConfiguredChannelConnectionStatus() {
  const provider = getTwitchProviderName();
  const channelLogin = process.env.TWITCH_CHANNEL_LOGIN?.trim() || "fenya";
  const channel = provider === "twitch" ? findChannelByLogin(channelLogin) : null;
  const storedAccount = channel?.ingest_twitch_account_id ? findTwitchAccountById(channel.ingest_twitch_account_id) : null;
  const account = storedAccount ? getSafeTwitchAccountStatus(storedAccount.id) : null;
  let appTokenAvailable = false;
  if (provider === "twitch") {
    try {
      await getAppAccessToken();
      appTokenAvailable = true;
    } catch {
      appTokenAvailable = false;
    }
  }

  if (account) {
    const tokenStatus = databaseTokenStatus(account);
    return {
      provider,
      channelLogin: channel.twitch_login,
      broadcasterId: channel.twitch_broadcaster_id,
      channelFound: true,
      channelHasOwner: Boolean(channel.owner_user_id),
      ingestAccountFound: true,
      oauthAccountFound: true,
      readerLogin: account.twitch_login,
      readerUserId: account.twitch_user_id,
      hasClientId: Boolean(process.env.TWITCH_CLIENT_ID?.trim()),
      hasClientSecret: Boolean(process.env.TWITCH_CLIENT_SECRET?.trim()),
      hasUserAccessToken: Boolean(account.has_access_token),
      hasRefreshToken: Boolean(account.has_refresh_token),
      appTokenAvailable,
      userTokenValid: tokenStatus === "valid" || tokenStatus === "refresh_required",
      userTokenScopes: parseScopes(account.scopes_json),
      expiresAt: account.expires_at ?? null,
      needsReauth: tokenStatus === "reauthorization_required",
      tokenStatus,
      tokenSource: "database_oauth",
      lastError: tokenStatus === "reauthorization_required" ? "Reconnect Twitch for the configured channel" : null,
    };
  }

  if (legacyDevelopmentMode() || provider !== "twitch") {
    let tokenInfo = null;
    if (provider === "twitch") {
      try {
        tokenInfo = await validateUserToken();
      } catch {
        tokenInfo = null;
      }
    }
    return {
      provider,
      channelLogin,
      broadcasterId: process.env.TWITCH_BROADCASTER_ID?.trim() || null,
      channelFound: Boolean(channel),
      channelHasOwner: Boolean(channel?.owner_user_id),
      ingestAccountFound: false,
      oauthAccountFound: false,
      readerLogin: tokenInfo?.login ?? null,
      readerUserId: tokenInfo?.user_id ?? null,
      hasClientId: Boolean(process.env.TWITCH_CLIENT_ID?.trim()),
      hasClientSecret: Boolean(process.env.TWITCH_CLIENT_SECRET?.trim()),
      hasUserAccessToken: Boolean(getConfiguredUserToken()),
      hasRefreshToken: Boolean(process.env.TWITCH_REFRESH_TOKEN?.trim()),
      appTokenAvailable,
      userTokenValid: Boolean(tokenInfo),
      userTokenScopes: tokenInfo?.scopes ?? [],
      expiresAt: null,
      needsReauth: provider === "twitch" ? !tokenInfo : false,
      tokenStatus: provider !== "twitch" ? "not_applicable" : tokenInfo ? "valid" : "reauthorization_required",
      tokenSource: "legacy_development",
      lastError: provider !== "twitch" || tokenInfo ? null : "Reconnect the legacy development Twitch token",
    };
  }

  return {
    provider,
    channelLogin,
    broadcasterId: channel?.twitch_broadcaster_id ?? null,
    channelFound: Boolean(channel),
    channelHasOwner: Boolean(channel?.owner_user_id),
    ingestAccountFound: false,
    oauthAccountFound: false,
    readerLogin: null,
    readerUserId: null,
    hasClientId: Boolean(process.env.TWITCH_CLIENT_ID?.trim()),
    hasClientSecret: Boolean(process.env.TWITCH_CLIENT_SECRET?.trim()),
    hasUserAccessToken: false,
    hasRefreshToken: false,
    appTokenAvailable,
    userTokenValid: false,
    userTokenScopes: [],
    expiresAt: null,
    needsReauth: true,
    tokenStatus: "reauthorization_required",
    tokenSource: "database_oauth",
    lastError: "Connect or reauthorize the chat reader account for the configured channel",
  };
}
