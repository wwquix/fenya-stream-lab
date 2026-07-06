import { describe, expect, test } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { formatDashboardModeDescription, formatDashboardModeLabel, getRoleBadgeKeys, getVodRowPresentation, isBackendUnavailable, isKnownFrontendPath, normalizeEmptyPanelVariant } from "../src/utils/dashboardUi.js";
import EmptyPanel from "../src/components/EmptyPanel.jsx";
import TwitchVodArchive from "../src/components/TwitchVodArchive.jsx";

const t = { modePrefix: "Режим", myChannelMode: "мой канал" };

describe("frontend dashboard UI helpers", () => {
  test("normalizes shared empty panel height variants", () => {
    expect(normalizeEmptyPanelVariant("chart")).toBe("chart");
    expect(normalizeEmptyPanelVariant("unknown")).toBe("medium");
  });

  test("formats all supported dashboard mode labels", () => {
    expect(formatDashboardModeLabel("legacy-fenya", null, t)).toBe("Режим: Fenya legacy");
    expect(formatDashboardModeLabel("connected-channel", "wwquix", t)).toBe("Режим: мой канал @wwquix");
    expect(formatDashboardModeLabel("mock", null, t)).toBe("Режим: demo");
  });

  test("explains legacy and connected-channel data boundaries", () => {
    const descriptions = {
      ...t,
      legacyModeDescription: "данные канала Fenya из локального сбора.",
      connectedChannelModeDescription: "данные появятся после запуска сбора для этого канала.",
    };
    expect(formatDashboardModeDescription("legacy-fenya", null, descriptions))
      .toBe("Режим: Fenya legacy — данные канала Fenya из локального сбора.");
    expect(formatDashboardModeDescription("connected-channel", "wwquix", descriptions))
      .toBe("Режим: мой канал @wwquix — данные появятся после запуска сбора для этого канала.");
  });

  test("derives visible role badges from role summary only", () => {
    expect(getRoleBadgeKeys({ isChannelOwner: true, isChatter: true, isModerator: false }))
      .toEqual(["roleChannelOwner", "roleChatter"]);
  });

  test("includes the local platform-admin badge without implying Twitch permissions", () => {
    expect(getRoleBadgeKeys({ isPlatformAdmin: true, isChannelOwner: true, isChatter: true }))
      .toEqual(["rolePlatformAdmin", "roleChannelOwner", "roleChatter"]);
  });

  test("distinguishes supported frontend entry paths from unknown routes", () => {
    expect(isKnownFrontendPath("/")).toBe(true);
    expect(isKnownFrontendPath("/index.html")).toBe(true);
    expect(isKnownFrontendPath("/missing-page")).toBe(false);
  });

  test("reports a backend outage only when both bootstrap requests fail", () => {
    const requestError = new Error("fetch failed");
    expect(isBackendUnavailable({ identityError: requestError, ingestError: requestError, connection: null, status: null })).toBe(true);
    expect(isBackendUnavailable({ identityError: requestError, ingestError: null, connection: null, status: null })).toBe(false);
    expect(isBackendUnavailable({ identityError: requestError, ingestError: requestError, connection: { provider: "mock" }, status: null })).toBe(false);
  });

  test("builds explicit VOD status and action fields", () => {
    const labels = { vodHasAnalytics: "Есть аналитика", vodOnly: "Только VOD", vodOpenTwitch: "Открыть" };
    expect(getVodRowPresentation({ hasInternalAnalytics: false }, labels)).toMatchObject({
      statusLabel: "Только VOD",
      actionLabel: "Открыть",
    });
    expect(getVodRowPresentation({ hasInternalAnalytics: true }, labels).statusLabel).toBe("Есть аналитика");
  });

  test("renders the shared empty panel message and action", () => {
    const markup = renderToStaticMarkup(createElement(EmptyPanel, {
      message: "Nothing collected yet",
      action: createElement("button", { type: "button" }, "Start ingest"),
      minHeight: "chart",
    }));

    expect(markup).toContain("Nothing collected yet");
    expect(markup).toContain("Start ingest");
    expect(markup).toContain("empty-panel-chart");
  });

  test("renders VOD rows without also rendering the empty state", () => {
    const vodText = {
      navTop: "Топ", vodArchiveTitle: "Архив Twitch VOD", vodArchiveNote: "VOD metadata",
      vodSyncing: "Syncing", vodSync: "Sync", vodSyncedCount: "Synced", vodSyncedTotal: "Total",
      vodTotalDuration: "Duration", vodTopViews: "Views", vodColumnTitle: "Title", vodColumnDate: "Date",
      duration: "Duration", vodViews: "Views", vodColumnStatus: "Status", vodColumnAction: "Action",
      vodHasAnalytics: "Analytics", vodOnly: "VOD only", vodOpenTwitch: "Open",
      vodNoResults: "Twitch returned no VODs", vodNotSynced: "Not synced", vodLegacyHint: "Legacy hint",
    };
    const archive = {
      hasLoaded: true,
      vods: [{ twitchVideoId: "vod-1", title: "Saved stream", createdAt: "2026-07-05", duration: "1h2m", viewCount: 42, url: "https://twitch.tv/videos/1" }],
    };
    const markup = renderToStaticMarkup(createElement(TwitchVodArchive, { archive, canSync: false, t: vodText }));

    expect(markup).toContain("Saved stream");
    expect(markup).not.toContain("Twitch returned no VODs");
  });
});
