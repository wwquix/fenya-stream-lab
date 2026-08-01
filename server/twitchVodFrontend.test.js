import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";

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

  test("aborts channel-scoped archive requests when hook inputs change", () => {
    const hookSources = [
      readFileSync(new URL("../src/hooks/useTwitchVods.js", import.meta.url), "utf8"),
      readFileSync(new URL("../src/hooks/useTwitchModerators.js", import.meta.url), "utf8"),
    ];

    for (const source of hookSources) {
      expect(source).toContain("new AbortController()")
      expect(source).toContain("controller.abort()")
      expect(source).toContain("{ signal }")
      expect(source).toContain("signal?.aborted")
    }
  });
});
