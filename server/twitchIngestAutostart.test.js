import { describe, expect, test, vi } from "vitest";

import { startConfiguredTwitchIngest } from "./services/twitchIngestAutostartService.js";

describe("Twitch ingest autostart", () => {
  test("starts ingest when the production flag is enabled", async () => {
    const startIngest = vi.fn().mockResolvedValue({ channelLogin: "fenya", collectedFrom: "2026-07-06T18:30:00Z" });
    const logger = { log: vi.fn(), error: vi.fn() };

    const result = await startConfiguredTwitchIngest({
      env: { TWITCH_PROVIDER: "twitch", TWITCH_LIVE_INGEST_AUTOSTART: "true" },
      startIngest,
      logger,
    });

    expect(startIngest).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ enabled: true, started: true });
    expect(logger.log.mock.calls.flat().join(" ")).toContain("channel=@fenya");
  });

  test("does not start ingest in mock mode or when the flag is disabled", async () => {
    const startIngest = vi.fn();

    await startConfiguredTwitchIngest({ env: { TWITCH_PROVIDER: "mock", TWITCH_LIVE_INGEST_AUTOSTART: "true" }, startIngest });
    await startConfiguredTwitchIngest({ env: { TWITCH_PROVIDER: "twitch", TWITCH_LIVE_INGEST_AUTOSTART: "false" }, startIngest });

    expect(startIngest).not.toHaveBeenCalled();
  });

  test("does not include thrown credential text in autostart logs", async () => {
    const logger = { log: vi.fn(), error: vi.fn() };
    await startConfiguredTwitchIngest({
      env: { TWITCH_PROVIDER: "twitch", TWITCH_LIVE_INGEST_AUTOSTART: "true" },
      startIngest: vi.fn().mockRejectedValue(new Error("secret-token-value")),
      logger,
    });

    expect(logger.error).toHaveBeenCalledWith("Twitch live ingest autostart failed");
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain("secret-token-value");
  });
});
