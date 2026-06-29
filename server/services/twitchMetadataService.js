import process from "node:process";

import { getTwitchChannelMetadata as getMockTwitchChannelMetadata } from "../providers/mockTwitchProvider.js";
import { getTwitchChannelMetadata as getRealTwitchChannelMetadata } from "../providers/twitchProvider.js";

function resolveTwitchProvider() {
  const providerName = process.env.TWITCH_PROVIDER || "mock";

  if (providerName === "twitch" || providerName === "real") {
    return getRealTwitchChannelMetadata;
  }

  return getMockTwitchChannelMetadata;
}

export async function loadTwitchChannelMetadata() {
  const channelLogin = process.env.TWITCH_CHANNEL_LOGIN || "fenya";
  return resolveTwitchProvider()(channelLogin);
}
