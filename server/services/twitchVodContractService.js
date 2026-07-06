export function toVodContract(row) {
  const mutedSegments = (() => {
    try { return JSON.parse(row.muted_segments_json || "[]"); } catch { return []; }
  })();
  return {
    id: row.id,
    channelId: row.channel_id,
    twitchVideoId: row.twitch_video_id,
    twitchUserId: row.twitch_user_id,
    title: row.title,
    description: row.description,
    createdAt: row.created_at,
    publishedAt: row.published_at,
    url: row.url,
    thumbnailUrl: row.thumbnail_url,
    viewable: row.viewable,
    viewCount: row.view_count,
    language: row.language,
    type: row.type,
    duration: row.duration,
    durationSeconds: row.duration_seconds,
    mutedSegments,
    syncedAt: row.synced_at,
    hasInternalAnalytics: Boolean(row.has_internal_analytics),
    matchedStreamSessionId: row.matched_stream_session_id,
  };
}

export function toVodComparisonContract(stats) {
  return {
    totalVods: stats.total_vods,
    totalDurationSeconds: stats.total_duration_seconds,
    averageDurationSeconds: stats.average_duration_seconds,
    topVod: stats.top_vod ? {
      twitchVideoId: stats.top_vod.twitch_video_id,
      title: stats.top_vod.title,
      viewCount: stats.top_vod.view_count,
    } : null,
    mostRecentVod: stats.most_recent_vod ? {
      twitchVideoId: stats.most_recent_vod.twitch_video_id,
      title: stats.most_recent_vod.title,
      createdAt: stats.most_recent_vod.created_at,
    } : null,
  };
}
