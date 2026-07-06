import process from "node:process";

import { HttpError } from "../middleware/errorHandlers.js";
import { markTwitchAccountNeedsReauth } from "../repositories/twitchAccountRepository.js";
import { getAppAccessToken } from "./twitchAuthService.js";
import { getValidUserAccessTokenForAccount, refreshTwitchAccountToken } from "./twitchTokenRefreshService.js";

const HELIX_BASE_URL = "https://api.twitch.tv/helix";

async function sendHelixRequest(endpoint, { token, method, body }) {
  const clientId = process.env.TWITCH_CLIENT_ID?.trim();
  if (!clientId) throw new HttpError(503, "Missing TWITCH_CLIENT_ID");
  const normalizedEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const response = await fetch(`${HELIX_BASE_URL}${normalizedEndpoint}`, {
    method,
    headers: {
      "Client-Id": clientId,
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await response.json().catch(() => ({}));

  return { normalizedEndpoint, payload, response };
}

export async function twitchHelixRequest(endpoint, { token, twitchAccountId, method = "GET", body } = {}) {
  let accessToken = token;
  if (twitchAccountId !== undefined) {
    accessToken = await getValidUserAccessTokenForAccount(twitchAccountId);
  } else if (!accessToken) {
    accessToken = await getAppAccessToken();
  }

  let result = await sendHelixRequest(endpoint, { token: accessToken, method, body });
  if (result.response.status === 401 && twitchAccountId !== undefined) {
    accessToken = await refreshTwitchAccountToken(twitchAccountId);
    result = await sendHelixRequest(endpoint, { token: accessToken, method, body });
    if (result.response.status === 401) markTwitchAccountNeedsReauth(twitchAccountId);
  }

  if (!result.response.ok) {
    const twitchMessage = typeof result.payload.message === "string" ? result.payload.message : "Unknown Twitch error";
    throw new HttpError(502, `Twitch Helix ${result.normalizedEndpoint} failed (${result.response.status}): ${twitchMessage}`);
  }
  return result.payload;
}
