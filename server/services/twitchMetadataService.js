import process from "node:process";

import { getTwitchChannelMetadata as getMockTwitchChannelMetadata } from "../providers/mockTwitchProvider.js";
import { getTwitchChannelMetadata as getRealTwitchChannelMetadata } from "../providers/twitchProvider.js";

export function getTwitchProviderName() {
  const providerName = process.env.TWITCH_PROVIDER || "mock";

  return providerName === "twitch" || providerName === "real" ? "twitch" : "mock";
}

function resolveTwitchProvider() {
  const providerName = getTwitchProviderName();

  if (providerName === "twitch") {
    return getRealTwitchChannelMetadata;
  }

  return getMockTwitchChannelMetadata;
}

export async function loadTwitchChannelMetadata(requestedChannelLogin) {
  const channelLogin = requestedChannelLogin || process.env.TWITCH_CHANNEL_LOGIN || "fenya";
  return resolveTwitchProvider()(channelLogin);
}
