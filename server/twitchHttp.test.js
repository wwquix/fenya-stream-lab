import { afterEach, describe, expect, test, vi } from "vitest";

import { fetchTwitch } from "./services/twitchHttpService.js";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Twitch HTTP boundary", () => {
  test("aborts an upstream request after its deadline", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
    })));

    const request = fetchTwitch("https://api.twitch.test/resource", {}, 25);
    const rejection = expect(request).rejects.toMatchObject({
      status: 504,
      message: "Twitch request timed out",
    });
    await vi.advanceTimersByTimeAsync(25);

    await rejection;
  });

  test("clears the deadline after a successful response", async () => {
    vi.useFakeTimers();
    const response = new Response("ok");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    await expect(fetchTwitch("https://api.twitch.test/resource", {}, 25)).resolves.toBe(response);
    expect(vi.getTimerCount()).toBe(0);
  });
});
