import { describe, expect, test, vi } from "vitest";

import { startConfiguredTwitchIngest } from "./services/twitchIngestAutostartService.js";

const channel = {
  id: 42,
  owner_user_id: null,
  ingest_twitch_account_id: 9,
  twitch_broadcaster_id: "broadcaster-fenya",
  twitch_login: "fenya",
};
const account = {
  id: 9,
  access_token_encrypted: "encrypted-access",
  refresh_token_encrypted: "encrypted-refresh",
  scopes_json: JSON.stringify(["user:read:chat"]),
  needs_reauth: 0,
};

function dependencies(overrides = {}) {
  return {
    findChannel: vi.fn().mockReturnValue(channel),
    findAccount: vi.fn().mockReturnValue(account),
    ...overrides,
  };
}

const enabledEnvironment = {
  TWITCH_PROVIDER: "twitch",
  TWITCH_LIVE_INGEST_AUTOSTART: "true",
  TWITCH_CHANNEL_LOGIN: "fenya",
};

describe("Twitch ingest autostart", () => {
  test("resolves the configured channel and starts numeric database ingest", async () => {
    const startIngest = vi.fn().mockResolvedValue({ channelId: 42, channelLogin: "fenya" });
    const deps = dependencies();
    const result = await startConfiguredTwitchIngest({
      env: enabledEnvironment,
      startIngest,
      logger: { log: vi.fn(), error: vi.fn() },
      ...deps,
    });
    expect(deps.findChannel).toHaveBeenCalledWith("fenya");
    expect(deps.findAccount).toHaveBeenCalledWith(9);
    expect(startIngest).toHaveBeenCalledWith(42);
    expect(result).toMatchObject({ enabled: true, started: true, channelId: 42 });
  });

  test("does not require TWITCH_USER_ACCESS_TOKEN", async () => {
    const result = await startConfiguredTwitchIngest({
      env: enabledEnvironment,
      startIngest: vi.fn().mockResolvedValue({ channelId: 42, channelLogin: "fenya" }),
      logger: { log: vi.fn(), error: vi.fn() },
      ...dependencies(),
    });
    expect(result.started).toBe(true);
  });

  test("a restart can reuse the persisted OAuth account without an environment token", async () => {
    const startIngest = vi.fn().mockResolvedValue({ channelId: 42, channelLogin: "fenya" });
    const deps = dependencies();
    const first = await startConfiguredTwitchIngest({ env: enabledEnvironment, startIngest, logger: { log: vi.fn(), error: vi.fn() }, ...deps });
    const second = await startConfiguredTwitchIngest({ env: enabledEnvironment, startIngest, logger: { log: vi.fn(), error: vi.fn() }, ...deps });
    expect(first.started).toBe(true);
    expect(second.started).toBe(true);
    expect(startIngest).toHaveBeenCalledTimes(2);
    expect(startIngest).toHaveBeenNthCalledWith(2, 42);
  });

  test("does not start in mock mode or when autostart is disabled", async () => {
    const startIngest = vi.fn();
    await startConfiguredTwitchIngest({ env: { TWITCH_PROVIDER: "mock", TWITCH_LIVE_INGEST_AUTOSTART: "true" }, startIngest });
    await startConfiguredTwitchIngest({ env: { TWITCH_PROVIDER: "twitch", TWITCH_LIVE_INGEST_AUTOSTART: "false" }, startIngest });
    expect(startIngest).not.toHaveBeenCalled();
  });

  test("a missing OAuth account returns a safe nonfatal error", async () => {
    const logger = { log: vi.fn(), error: vi.fn() };
    const result = await startConfiguredTwitchIngest({
      env: enabledEnvironment,
      startIngest: vi.fn(),
      logger,
      ...dependencies({ findAccount: vi.fn().mockReturnValue(null) }),
    });
    expect(result).toMatchObject({ enabled: true, started: false, channelId: 42, error: "twitch-connection-required" });
    expect(logger.error.mock.calls.flat().join(" ")).toContain("chat reader account");
  });

  test("autostart logs never include thrown token values", async () => {
    const logger = { log: vi.fn(), error: vi.fn() };
    await startConfiguredTwitchIngest({
      env: enabledEnvironment,
      startIngest: vi.fn().mockRejectedValue(new Error("fake-token-must-not-appear")),
      logger,
      ...dependencies(),
    });
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain("fake-token-must-not-appear");
  });
});
