const MOCK_CHANNELS = {
  fenya: {
    displayName: "Fenya",
    profileImageUrl: "https://placehold.co/256x256/111827/c7f85c?text=Fenya",
    broadcasterId: "mock-fenya-001",
    isLive: true,
    streamTitle: "Вечерний рейтинговый стрим",
    categoryName: "Counter-Strike 2",
    viewerCount: 1284,
    startedAt: "2026-06-26T18:30:00.000Z",
  },
};

function normalizeChannelLogin(channelLogin) {
  return String(channelLogin || "").trim().toLowerCase();
}

export async function getTwitchChannelMetadata(channelLogin) {
  const normalizedLogin = normalizeChannelLogin(channelLogin);
  const channel = MOCK_CHANNELS[normalizedLogin] || MOCK_CHANNELS.fenya;

  return {
    displayName: channel.displayName,
    profileImageUrl: channel.profileImageUrl,
    broadcasterId: channel.broadcasterId,
    isLive: channel.isLive,
    streamTitle: channel.streamTitle,
    categoryName: channel.categoryName,
    viewerCount: channel.viewerCount,
    startedAt: channel.startedAt,
  };
}
