import process from "node:process";

import { HttpError } from "../middleware/errorHandlers.js";
import { getAppAccessToken } from "./twitchAuthService.js";

const HELIX_BASE_URL = "https://api.twitch.tv/helix";

export async function twitchHelixRequest(endpoint, { token, method = "GET", body } = {}) {
  const clientId = process.env.TWITCH_CLIENT_ID?.trim();
  if (!clientId) throw new HttpError(503, "Missing TWITCH_CLIENT_ID");

  const accessToken = token || await getAppAccessToken();
  const normalizedEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const response = await fetch(`${HELIX_BASE_URL}${normalizedEndpoint}`, {
    method,
    headers: {
      "Client-Id": clientId,
      Authorization: `Bearer ${accessToken}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const twitchMessage = typeof payload.message === "string" ? payload.message : "Unknown Twitch error";
    throw new HttpError(502, `Twitch Helix ${normalizedEndpoint} failed (${response.status}): ${twitchMessage}`);
  }
  return payload;
}
