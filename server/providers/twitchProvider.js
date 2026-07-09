import { HttpError } from "../middleware/errorHandlers.js";
import { twitchHelixRequest } from "../services/twitchHelixClient.js";

export async function getTwitchChannelMetadata(channelLogin) {
  const normalizedLogin = String(channelLogin || "").trim().toLowerCase();
  if (!normalizedLogin) throw new HttpError(400, "Twitch channel login is required");

  const users = await twitchHelixRequest(`/users?login=${encodeURIComponent(normalizedLogin)}`);
  const user = users.data?.[0];
  if (!user) throw new HttpError(404, `Twitch channel not found: ${normalizedLogin}`);

  const broadcasterId = user.id;
  const [channels, streams] = await Promise.all([
    twitchHelixRequest(`/channels?broadcaster_id=${encodeURIComponent(broadcasterId)}`),
    twitchHelixRequest(`/streams?user_id=${encodeURIComponent(broadcasterId)}`),
  ]);
  const channel = channels.data?.[0] ?? {};
  const stream = streams.data?.[0] ?? null;

  return {
    provider: "twitch",
    channelLogin: user.login || normalizedLogin,
    broadcasterId,
    displayName: user.display_name || user.login || normalizedLogin,
    profileImageUrl: user.profile_image_url || null,
    description: user.description || "",
    isLive: Boolean(stream),
    streamId: stream?.id ?? null,
    streamTitle: stream?.title ?? channel.title ?? "",
    categoryName: stream?.game_name ?? channel.game_name ?? "",
    categoryId: stream?.game_id ?? channel.game_id ?? null,
    viewerCount: stream?.viewer_count ?? 0,
    thumbnailUrl: stream?.thumbnail_url ?? null,
    startedAt: stream?.started_at ?? null,
    language: stream?.language ?? channel.broadcaster_language ?? null,
    fetchedAt: new Date().toISOString(),
  };
}
