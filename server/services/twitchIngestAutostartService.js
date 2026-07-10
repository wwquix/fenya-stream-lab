import process from "node:process";

import { findChannelByLogin } from "../repositories/channelRepository.js";
import { findTwitchAccountByUserId } from "../repositories/twitchAccountRepository.js";
import { startChannelIngest } from "./twitchIngestPoolService.js";

const REQUIRED_CHAT_SCOPE = "user:read:chat";

function parseScopes(value) {
  try {
    const scopes = JSON.parse(value || "[]");
    return Array.isArray(scopes) ? scopes : [];
  } catch {
    return [];
  }
}

function assertDatabaseOAuthReady(channel, account) {
  if (!channel?.owner_user_id) throw new Error("Configured Twitch channel has no owner");
  if (!account?.access_token_encrypted || !account?.refresh_token_encrypted) {
    throw new Error("Configured Twitch channel has no complete OAuth account");
  }
  if (account.needs_reauth || !parseScopes(account.scopes_json).includes(REQUIRED_CHAT_SCOPE)) {
    throw new Error("Configured Twitch authorization requires reconnection");
  }
}

export async function startConfiguredTwitchIngest({
  env = process.env,
  findChannel = findChannelByLogin,
  findAccount = findTwitchAccountByUserId,
  startIngest = startChannelIngest,
  logger = console,
} = {}) {
  const enabled = ["twitch", "real"].includes(String(env.TWITCH_PROVIDER || "").trim().toLowerCase())
    && String(env.TWITCH_LIVE_INGEST_AUTOSTART).trim().toLowerCase() === "true";
  if (!enabled) return { enabled: false, started: false };

  const channelLogin = String(env.TWITCH_CHANNEL_LOGIN || "").trim();
  let channel = null;

  try {
    channel = channelLogin ? findChannel(channelLogin) : null;
    if (!channel) throw new Error("Configured Twitch channel was not found");
    const account = channel.owner_user_id ? findAccount(channel.owner_user_id) : null;
    assertDatabaseOAuthReady(channel, account);
    const status = await startIngest(channel.id);
    logger.log(`Twitch database OAuth ingest autostarted: channelId=${channel.id}, channel=@${status.channelLogin || channel.twitch_login}`);
    return { enabled: true, started: true, channelId: channel.id, status };
  } catch {
    logger.error("Twitch ingest autostart failed; connect or reauthorize Twitch for the configured channel");
    return { enabled: true, started: false, channelId: channel?.id ?? null, error: "twitch-connection-required" };
  }
}
