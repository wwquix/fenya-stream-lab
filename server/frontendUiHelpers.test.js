import { describe, expect, test } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { canControlIngest, formatDashboardModeDescription, formatDashboardModeLabel, getRoleBadgeKeys, getVodRowPresentation, hasCollectionGap, isBackendUnavailable, isKnownFrontendPath, normalizeEmptyPanelVariant, normalizeRole, normalizeTwitchThumbnailUrl, resolveDashboardPermissions, resolveInitialTheme } from "../src/utils/dashboardUi.js";
import EmptyPanel from "../src/components/EmptyPanel.jsx";
import TwitchVodArchive from "../src/components/TwitchVodArchive.jsx";
import StreamPulse from "../src/components/StreamPulse.jsx";
import StreamControlBar from "../src/components/StreamControlBar.jsx";
import { translations } from "../src/i18n/translations.js";

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
      .toEqual(["roleChannelOwner"]);
  });

  test("includes the local platform-admin badge without implying Twitch permissions", () => {
    expect(getRoleBadgeKeys({ isPlatformAdmin: true, isChannelOwner: true, isChatter: true }))
      .toEqual(["rolePlatformAdmin", "roleChannelOwner"]);
  });

  test("normalizes the four permission roles and resolves contextual ingest control", () => {
    expect(normalizeRole(" CHANNEL_OWNER ")).toBe("channel_owner");
    expect(normalizeRole("unknown")).toBe("chatter");
    expect(canControlIngest("platform_admin")).toBe(true);
    expect(canControlIngest("moderator")).toBe(false);

    const identity = {
      isLoggedIn: true,
      role: "channel_owner",
      memberships: [
        { channelId: 7, channelLogin: "fenya", role: "chatter" },
        { channelId: 9, channelLogin: "own_channel", role: "channel_owner" },
      ],
    };
    expect(resolveDashboardPermissions({ identity, dashboardMode: "connected-channel", selectedChannel: { id: 7, role: "chatter" } }))
      .toEqual({ role: "chatter", canControlIngest: false, readOnly: true });
    expect(resolveDashboardPermissions({ identity, dashboardMode: "connected-channel", selectedChannel: { id: 9, role: "channel_owner" } }))
      .toEqual({ role: "channel_owner", canControlIngest: true, readOnly: false });
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

  test("shows a collection gap only when Twitch was already live", () => {
    expect(hasCollectionGap("2026-07-06T18:00:00Z", "2026-07-06T18:35:00Z")).toBe(true);
    expect(hasCollectionGap("2026-07-06T18:35:00Z", "2026-07-06T18:35:00Z")).toBe(false);
    expect(hasCollectionGap(null, "2026-07-06T18:35:00Z")).toBe(false);
  });

  test("normalizes Twitch thumbnail placeholders and rejects empty values", () => {
    expect(normalizeTwitchThumbnailUrl("https://static.test/live-{width}x%{height}.jpg"))
      .toBe("https://static.test/live-320x180.jpg");
    expect(normalizeTwitchThumbnailUrl("  ")).toBeNull();
  });

  test("defaults new visitors to dark while preserving an explicit light preference", () => {
    expect(resolveInitialTheme(null)).toBe("dark");
    expect(resolveInitialTheme("dark")).toBe("dark");
    expect(resolveInitialTheme("light")).toBe("light");
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

  test("does not render an empty replay rail when Pulse has no category segments", () => {
    const pulseText = {
      streamControls: "Controls", streamPulse: "Pulse", streamPulseNote: "Live samples",
      viewers: "Viewers", chatPerMin: "Messages/min", compare: "Compare", streamPreview: "Preview",
      previewSlot: "Stream", previewUnavailable: "Preview unavailable", time: "Time", event: "Event",
      categoryOther: "Other", categoryJustChatting: "Just Chatting", categoryCs2: "CS2", categoryMinecraft: "Minecraft",
    };
    const stream = {
      id: "real-stream", title: "Real stream", category: "CS2", thumbnailUrl: null,
      categorySegments: [],
      chartData: [
        { time: "18:00", viewers: 100, chatMessagesPerMinute: 5, category: "CS2", previewLabel: "Start" },
        { time: "18:10", viewers: 120, chatMessagesPerMinute: 8, category: "CS2", previewLabel: "Live" },
      ],
    };

    const markup = renderToStaticMarkup(createElement(StreamPulse, { stream, compareStream: null, events: [], t: pulseText }));
    expect(markup).not.toContain("replay-strip");
  });

  test("read-only Twitch UI omits ingest mutation buttons", () => {
    const stream = {
      id: "stream-1", title: "Live", category: "CS2", summary: {}, chartData: [], categorySegments: [],
    };
    const markup = renderToStaticMarkup(createElement(StreamControlBar, {
      streams: [stream], selectedStreamId: stream.id, compareStreamId: "",
      onStreamChange: () => {}, onCompareChange: () => {},
      twitchMetadata: { metadata: { isLive: true, streamTitle: "Live", categoryName: "CS2" } },
      twitchIngest: {
        connection: { appTokenAvailable: true, userTokenValid: true, channelLogin: "fenya" },
        status: { status: "running", running: true, messagesStored: 10 },
        start: () => Promise.resolve(), stop: () => Promise.resolve(),
      },
      persistedMessageCount: 25, isTwitchMode: true, dashboardMode: "legacy-fenya",
      canManageChannel: false, readOnlyAccess: true, isDataModeLoading: false,
      theme: "dark", onToggleTheme: () => {},
      replay: { error: null, status: { isActive: false }, isPending: false },
      streamSummary: { summary: null, isGenerating: false, isLoading: false, error: null },
      t: translations.ru,
    }));

    expect(markup).toContain("Только просмотр");
    expect(markup).not.toContain("Остановить сбор");
    expect(markup).not.toContain("Сбор уже идёт");
  });
});
