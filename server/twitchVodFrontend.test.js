import { describe, expect, test } from "vitest";

import { normalizeVodPayload } from "../src/hooks/useTwitchVods.js";

const vod = { twitchVideoId: "vod-1", title: "Saved stream" };

describe("Twitch VOD frontend response normalization", () => {
  test("reads the VOD list response shape", () => {
    expect(normalizeVodPayload({ vods: [vod] })).toEqual([vod]);
  });

  test("reads the VOD sync response shape", () => {
    expect(normalizeVodPayload({ syncedCount: 1, vods: [vod] })).toEqual([vod]);
  });

  test("supports wrapped data without exposing unrelated fields", () => {
    expect(normalizeVodPayload({ data: { vods: [vod] }, access_token: "not-a-vod" })).toEqual([vod]);
  });

  test("caps rendering at the latest 50 VODs", () => {
    const vods = Array.from({ length: 55 }, (_, index) => ({ twitchVideoId: `vod-${index}` }));
    expect(normalizeVodPayload({ vods })).toHaveLength(50);
  });
});
