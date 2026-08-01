import { describe, expect, test, vi } from "vitest";

import { createReplayScheduler } from "../src/utils/sessionDashboard.js";

describe("client replay scheduler validation", () => {
  test.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid playback speed %s before emitting a frame",
    (speed) => {
      const schedule = vi.fn();
      const onFrame = vi.fn();
      const replay = createReplayScheduler({ schedule });

      expect(replay.start([{ time: "10:00" }, { time: "10:01" }], speed, onFrame)).toBe(false);
      expect(replay.isActive()).toBe(false);
      expect(onFrame).not.toHaveBeenCalled();
      expect(schedule).not.toHaveBeenCalled();
    },
  );

  test("rejects a missing frame callback without activating replay", () => {
    const replay = createReplayScheduler();

    expect(replay.start([{ time: "10:00" }, { time: "10:01" }], 1)).toBe(false);
    expect(replay.isActive()).toBe(false);
  });
});
