import { describe, expect, test } from "vitest";

import {
  buildAdvancedAnalyticsEndpoint,
  createAdvancedAnalyticsFallback,
  normalizeAdvancedAnalytics,
} from "../src/hooks/useAdvancedAnalytics.js";

describe("advanced insights frontend data boundary", () => {
  test("builds generic and authenticated channel-scoped endpoints", () => {
    expect(buildAdvancedAnalyticsEndpoint({
      streamId: "stream / 42",
      dashboardMode: "mock",
      channelId: null,
    })).toBe("/api/streams/stream%20%2F%2042/advanced-analytics");

    expect(buildAdvancedAnalyticsEndpoint({
      streamId: "stream / 42",
      dashboardMode: "connected-channel",
      channelId: "channel / 7",
    })).toBe("/api/channels/channel%20%2F%207/streams/stream%20%2F%2042/advanced-analytics");
  });

  test("normalizes nullable metrics without converting missing values to zero", () => {
    const result = normalizeAdvancedAnalytics({
      streamId: "stream-1",
      dataQuality: { status: "partial" },
      loyalty: {
        activeParticipants: 1,
        knownParticipantsShare: 1,
        reactivatedShare: 0.25,
      },
      clipSuggestions: [{
        peakTime: "18:20",
        durationMinutes: 3,
        signalDurationMinutes: 2,
        viewerDirection: "down",
        viewerBaselinePercent: 1,
        confidence: 1,
      }],
      eventImpact: [{
        effectDurationMinutes: null,
        effectObservedMinutes: 4,
        effectCensored: true,
      }],
      retention: {
        startViewers: null,
        dropCount: 0,
        recoveryRatio: null,
        curve: [],
        drops: [],
      },
    });

    expect(result.loyalty).toMatchObject({
      activeParticipants: 1,
      knownParticipantsShare: 1,
      reactivatedShare: 0.25,
    });
    expect(result.loyalty.newParticipants).toBeNull();
    expect(result.clipSuggestions[0]).toMatchObject({
      viewerBaselinePercent: 1,
      confidence: 1,
      durationMinutes: 3,
      signalDurationMinutes: 2,
      viewerDirection: "down",
    });
    expect(result.eventImpact[0]).toMatchObject({
      effectDurationMinutes: null,
      effectObservedMinutes: 4,
      effectCensored: true,
    });
    expect(result.retention.startViewers).toBeNull();
  });

  test("uses deterministic fallback data only in mock mode", () => {
    const first = createAdvancedAnalyticsFallback({
      streamId: "stream-1",
      dashboardMode: "mock",
      requestError: new TypeError("fetch failed"),
    });
    const second = createAdvancedAnalyticsFallback({
      streamId: "stream-1",
      dashboardMode: "mock",
      requestError: new Error("invalid response"),
    });

    expect(second).toEqual(first);
    expect(first).toMatchObject({
      streamId: "stream-1",
      source: "mock",
      dataQuality: {
        status: "partial",
        warnings: ["static-demo-fallback"],
      },
    });
    expect(first.clipSuggestions.length).toBeGreaterThan(0);
    expect(first.eventImpact.length).toBeGreaterThan(0);
    expect(first.retention.curve.length).toBeGreaterThan(1);
  });

  test.each(["legacy-fenya", "connected-channel"])(
    "never supplies static fallback data in %s mode",
    (dashboardMode) => {
      expect(createAdvancedAnalyticsFallback({
        streamId: "stream-1",
        dashboardMode,
        requestError: new TypeError("fetch failed"),
      })).toBeNull();
    },
  );

  test("does not hide HTTP errors behind mock fallback data", () => {
    const notFound = new Error("not found");
    notFound.status = 404;
    const unavailable = new Error("unavailable");
    unavailable.status = 503;

    expect(createAdvancedAnalyticsFallback({
      streamId: "stream-1",
      dashboardMode: "mock",
      requestError: notFound,
    })).toBeNull();
    expect(createAdvancedAnalyticsFallback({
      streamId: "stream-1",
      dashboardMode: "mock",
      requestError: unavailable,
    })).toBeNull();
  });
});
