import { describe, expect, test } from "vitest";

import {
  ADVANCED_ANALYTICS_CONFIG,
  buildAdvancedAnalytics,
  calculateClipSuggestions,
  calculateEventImpact,
  calculateLoyalty,
  calculateRetention,
} from "./services/advancedAnalyticsService.js";

const BASE_TIME = Date.parse("2026-07-20T18:00:00.000Z");

function timestamp(minute) {
  return new Date(BASE_TIME + minute * 60_000).toISOString();
}

function timeLabel(minute) {
  const date = new Date(BASE_TIME + minute * 60_000);
  return `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
}

function historyStream(streamId, index, { channelId = 1, source = "twitch" } = {}) {
  return {
    streamId,
    channelId,
    channelLogin: channelId === 1 ? "fenya" : "other_channel",
    startedAt: timestamp(index * 24 * 60),
    collectedFrom: timestamp(index * 24 * 60),
    endedAt: timestamp(index * 24 * 60 + 180),
    streamDate: `2026-07-${String(15 + index).padStart(2, "0")}`,
    status: "completed",
    source,
    createdAt: timestamp(index * 24 * 60),
  };
}

function message(streamId, login, minute, eventId = `${streamId}:${login}:${minute}`) {
  return {
    streamId,
    eventId,
    time: timeLabel(minute),
    timestamp: timestamp(minute),
    login,
  };
}

function sample(minute, viewers, messagesPerMinute = 5) {
  return {
    eventId: `sample:${minute}`,
    time: timeLabel(minute),
    timestamp: timestamp(minute),
    viewers,
    messagesPerMinute,
    source: "twitch",
  };
}

function marker(minute, {
  eventId = `marker:${minute}`,
  label = "Saved marker",
  type = "highlight",
} = {}) {
  return {
    eventId,
    time: timeLabel(minute),
    timestamp: timestamp(minute),
    label,
    type,
    category: "CS2",
    viewers: null,
    messagesPerMinute: null,
    source: "twitch",
  };
}

function segment(startMinute, endMinute, label = "Segment") {
  return {
    eventId: `segment:${startMinute}`,
    start: timeLabel(startMinute),
    end: timeLabel(endMinute),
    label,
    category: "CS2",
    source: "twitch",
  };
}

function dataset({
  streams = Array.from({ length: 5 }, (_, index) => historyStream(`stream-${index + 1}`, index)),
  selectedStreamId = streams.at(-1)?.streamId ?? "stream-5",
  viewerSamples = [],
  chatMessages = [],
  chatters = [],
  markers = [],
  segments = [],
  channelId = 1,
  source = "twitch",
  collectedFrom = timestamp(0),
} = {}) {
  const selected = streams.find((stream) => stream.streamId === selectedStreamId)
    ?? historyStream(selectedStreamId, streams.length, { channelId, source });
  return {
    stream: {
      stream_id: selectedStreamId,
      channel_id: channelId,
      channel_login: channelId === 1 ? "fenya" : "other_channel",
      title: "Selected stream",
      started_at: selected.startedAt ?? timestamp(0),
      collected_from: collectedFrom,
      ended_at: selected.endedAt ?? timestamp(180),
      source,
      status: "completed",
    },
    streams,
    viewerSamples,
    chatMessages,
    chatters,
    markers,
    segments,
  };
}

function participantsByLogin(result) {
  return Object.fromEntries(result.participants.map((participant) => [participant.login, participant]));
}

function timeline(values, startMinute = 0, stepMinutes = 2, chatValues = []) {
  return values.map((viewers, index) => sample(
    startMinute + index * stepMinutes,
    viewers,
    chatValues[index] ?? 5,
  ));
}

describe("advanced analytics pure calculations", () => {
  describe("configuration", () => {
    test("centralizes every analytical threshold in named configuration groups", () => {
      expect(ADVANCED_ANALYTICS_CONFIG).toEqual({
        loyalty: {
          minimumHistoryStreams: 3,
          recentStreamWindow: 5,
          regularMinimumStreams: 3,
          reactivationMinimumMissedStreams: 2,
          topParticipantLimit: 10,
        },
        clips: {
          minimumSamples: 6,
          rollingBaselinePoints: 4,
          minimumScore: 28,
          maximumSuggestions: 5,
          mergeGapIntervals: 1.5,
          maximumWindowIntervals: 3,
          markerProximityIntervals: 1.5,
          segmentProximityIntervals: 1,
          viewerDeviationTarget: 0.25,
          viewerChangeTarget: 0.18,
          chatDeviationTarget: 0.5,
          chatChangeTarget: 0.45,
          durationTargetPoints: 3,
          durationScoreWeight: 0.08,
          markerMinimumScore: 32,
          absoluteTimestampConfidenceWeight: 0.15,
        },
        eventImpact: {
          baselinePoints: 3,
          postEventPoints: 3,
          extendedPostEventPoints: 6,
          minimumPointsPerSide: 2,
          notableChangeRatio: 0.08,
        },
        retention: {
          smoothingPoints: 3,
          earlyPeriodRatio: 0.15,
          minimumDropRatio: 0.12,
          minimumConsecutivePoints: 2,
          mergeGapIntervals: 1.5,
          fullRecoveryRatio: 0.9,
          partialRecoveryRatio: 0.5,
          segmentWindowPoints: 3,
        },
      });
    });
  });

  describe("data quality", () => {
    test("does not treat database insertion time as a missing chat event timestamp", () => {
      const input = dataset({
        viewerSamples: timeline([100, 101, 102, 103, 104, 105]),
        chatMessages: [{
          streamId: "stream-5",
          login: "timestamp_gap",
          messageCount: 1,
          firstKnownAt: timestamp(5),
          lastKnownAt: timestamp(5),
          missingTimestampCount: 1,
        }],
      });
      const result = buildAdvancedAnalytics(input, { generatedAt: timestamp(10) });

      expect(result.dataQuality.hasAbsoluteTimestamps).toBe(false);
      expect(result.dataQuality.warnings).toContain("missing-absolute-timestamps");
    });
  });

  describe("chat loyalty", () => {
    test("classifies new, returning, regular, and reactivated chatters without conflicts", () => {
      const streams = Array.from({ length: 5 }, (_, index) => historyStream(`s${index + 1}`, index));
      const chatMessages = [
        message("s1", "regular_user", 1),
        message("s3", "regular_user", 2),
        message("s5", "REGULAR_USER", 3),
        message("s4", "returning_user", 4),
        message("s5", "Returning_User", 5),
        message("s1", "reactivated_user", 6),
        message("s2", "reactivated_user", 7),
        message("s5", "Reactivated_User", 8),
        message("s5", "New_User", 9),
        message("s5", " new_user ", 10),
      ];

      const result = calculateLoyalty(dataset({
        streams,
        selectedStreamId: "s5",
        chatMessages,
      }));
      const byLogin = participantsByLogin(result);

      expect(result).toMatchObject({
        activeParticipants: 4,
        newParticipants: 1,
        returningParticipants: 1,
        regularParticipants: 1,
        reactivatedParticipants: 1,
        historyStreamsUsed: 5,
        isSufficient: true,
      });
      expect(byLogin.new_user).toMatchObject({
        login: "new_user",
        messagesInSelectedStream: 2,
        category: "new",
      });
      expect(byLogin.returning_user.category).toBe("returning");
      expect(byLogin.regular_user).toMatchObject({ category: "regular", streamsAttended: 3 });
      expect(byLogin.reactivated_user.category).toBe("reactivated");
      expect(new Set(result.participants.map((participant) => participant.category)).size).toBe(4);
    });

    test("normalizes login casing consistently and bases shares on current active chatters", () => {
      const streams = Array.from({ length: 5 }, (_, index) => historyStream(`case-${index + 1}`, index));
      const result = calculateLoyalty(dataset({
        streams,
        selectedStreamId: "case-5",
        chatMessages: [
          message("case-2", " ViewerOne ", 1),
          message("case-5", "viewerone", 2),
          message("case-5", "VIEWERONE", 3),
          message("case-5", "SecondViewer", 4),
        ],
      }));

      expect(result.activeParticipants).toBe(2);
      expect(result.participants.map((participant) => participant.login)).toEqual(["viewerone", "secondviewer"]);
      expect(result.participants.find((participant) => participant.login === "viewerone"))
        .toMatchObject({
          messagesInSelectedStream: 2,
          streamsAttended: 2,
          firstKnownAt: timestamp(1),
          lastKnownAt: timestamp(3),
        });
      expect(result.knownParticipantsShare).toBeGreaterThan(0);
    });

    test("sums case-variant aggregate chatter rows without double-counting raw messages", () => {
      const streams = Array.from({ length: 5 }, (_, index) => historyStream(`aggregate-${index + 1}`, index));
      const result = calculateLoyalty(dataset({
        streams,
        selectedStreamId: "aggregate-5",
        chatMessages: [
          message("aggregate-5", "Aggregate_User", 1),
          message("aggregate-5", "aggregate_user", 2),
        ],
        chatters: [
          { streamId: "aggregate-5", nickname: "Aggregate_User", messageCount: 3 },
          { streamId: "aggregate-5", nickname: "aggregate_user", messageCount: 4 },
        ],
      }));

      expect(result.participants).toHaveLength(1);
      expect(result.participants[0]).toMatchObject({
        login: "aggregate_user",
        messagesInSelectedStream: 7,
        category: "new",
      });
    });

    test("uses insufficient-history when there are too few saved streams", () => {
      const streams = [historyStream("short-1", 0), historyStream("short-2", 1)];
      const result = calculateLoyalty(dataset({
        streams,
        selectedStreamId: "short-2",
        chatMessages: [
          message("short-1", "known_user", 1),
          message("short-2", "known_user", 2),
          message("short-2", "new_user", 3),
        ],
      }));

      expect(result.isSufficient).toBe(false);
      expect(result.historyStreamsUsed).toBe(2);
      expect(result.participants.every((participant) => participant.category === "insufficient-history")).toBe(true);
    });

    test("returns an honest empty result for a stream without messages", () => {
      const result = calculateLoyalty(dataset());

      expect(result).toMatchObject({
        activeParticipants: 0,
        newParticipants: 0,
        returningParticipants: 0,
        regularParticipants: 0,
        reactivatedParticipants: 0,
        participants: [],
        topParticipants: [],
      });
      expect(Number.isFinite(result.newShare)).toBe(true);
    });
  });

  describe("clip suggestions", () => {
    test("ranks a simultaneous viewer/chat spike and explains a nearby marker", () => {
      const viewerSamples = timeline(
        [100, 102, 99, 101, 105, 220, 235, 210, 108, 104, 102],
        0,
        2,
        [5, 5, 6, 5, 6, 30, 42, 28, 7, 6, 5],
      );
      const result = calculateClipSuggestions(dataset({
        viewerSamples,
        markers: [marker(12, { label: "Clutch" })],
      }));

      expect(result.length).toBeGreaterThan(0);
      expect(result.length).toBeLessThanOrEqual(5);
      expect(result[0]).toEqual(expect.objectContaining({
        startTime: expect.any(String),
        peakTime: expect.any(String),
        endTime: expect.any(String),
        score: expect.any(Number),
        confidence: expect.anything(),
        reasons: expect.any(Array),
        peakViewers: expect.any(Number),
        peakMessagesPerMinute: expect.any(Number),
        time: expect.any(String),
        label: expect.any(String),
        type: expect.any(String),
        viewers: expect.any(Number),
        messagesPerMinute: expect.any(Number),
      }));
      expect(result.some((candidate) => candidate.marker?.label === "Clutch")).toBe(true);
      expect(result.some((candidate) => candidate.peakViewers >= 220 && candidate.peakMessagesPerMinute >= 30)).toBe(true);
    });

    test("detects chat-only and viewer-only spikes after normalizing metric scales", () => {
      const chatOnly = calculateClipSuggestions(dataset({
        viewerSamples: timeline(
          [100, 101, 100, 99, 100, 101, 100, 100],
          0,
          2,
          [5, 5, 5, 5, 35, 40, 6, 5],
        ),
      }));
      const viewersOnly = calculateClipSuggestions(dataset({
        viewerSamples: timeline(
          [100, 100, 101, 100, 220, 240, 105, 100],
          0,
          2,
          [5, 5, 5, 5, 5, 6, 5, 5],
        ),
      }));

      expect(chatOnly.some((candidate) => candidate.peakMessagesPerMinute >= 35)).toBe(true);
      expect(viewersOnly.some((candidate) => candidate.peakViewers >= 220)).toBe(true);
    });

    test("detects a sharp viewer cliff and exposes its downward direction", () => {
      const result = calculateClipSuggestions(dataset({
        viewerSamples: timeline(
          [200, 200, 200, 200, 80, 80, 80, 80],
          0,
          2,
          Array(8).fill(5),
        ),
      }));

      expect(result.length).toBeGreaterThan(0);
      expect(result.some((candidate) => (
        candidate.viewerDirection === "down"
        && candidate.reasons.includes("viewer-change")
        && !candidate.reasons.includes("viewer-spike")
      ))).toBe(true);
    });

    test("uses sustained signal duration and timestamp coverage in ranking confidence", () => {
      const singleInput = dataset({
        viewerSamples: timeline(
          [100, 100, 100, 100, 100, 100, 100, 220],
          0,
          2,
          Array(8).fill(5),
        ),
      });
      const sustainedInput = dataset({
        viewerSamples: timeline(
          [100, 100, 100, 100, 100, 220, 220, 220],
          0,
          2,
          Array(8).fill(5),
        ),
      });
      const single = calculateClipSuggestions(singleInput);
      const sustained = calculateClipSuggestions(sustainedInput);
      const relativeOnlyInput = structuredClone(sustainedInput);
      relativeOnlyInput.stream.started_at = null;
      relativeOnlyInput.viewerSamples = relativeOnlyInput.viewerSamples.map((point) => ({
        eventId: point.eventId,
        time: point.time,
        viewers: point.viewers,
        messagesPerMinute: point.messagesPerMinute,
        source: point.source,
      }));
      const relativeOnly = calculateClipSuggestions(relativeOnlyInput);

      expect(sustained[0].score).toBeGreaterThan(single[0].score);
      expect(sustained[0].signalDurationMinutes).toBeGreaterThan(single[0].signalDurationMinutes);
      expect(sustained[0].reasons).toContain("sustained-spike");
      expect(sustained[0].confidence).toBeGreaterThan(relativeOnly[0].confidence);
      expect(relativeOnly[0].startTime).toMatch(/^\d{2}:\d{2}$/);
      expect(relativeOnly[0].peakTime).toMatch(/^\d{2}:\d{2}$/);
      expect(relativeOnly[0].endTime).toMatch(/^\d{2}:\d{2}$/);
      expect(JSON.stringify(relativeOnly[0])).not.toContain("1970-");
    });

    test("merges adjacent high points, keeps distant candidates non-overlapping, and is deterministic", () => {
      const viewerSamples = timeline(
        [100, 100, 110, 230, 245, 225, 110, 100, 100, 105, 100, 210, 235, 215, 105, 100],
        0,
        3,
        [5, 5, 6, 32, 40, 28, 6, 5, 5, 6, 5, 25, 36, 24, 6, 5],
      );
      const input = dataset({ viewerSamples });
      const first = calculateClipSuggestions(input);
      const second = calculateClipSuggestions(input);

      expect(first).toEqual(second);
      expect(first.length).toBeGreaterThanOrEqual(2);
      expect(first.length).toBeLessThanOrEqual(5);
      const chronological = [...first].sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));
      for (let index = 1; index < chronological.length; index += 1) {
        expect(Date.parse(chronological[index].startTime))
          .toBeGreaterThanOrEqual(Date.parse(chronological[index - 1].endTime));
      }
    });

    test("caps a transitive candidate chain to an editorially useful window around its peak", () => {
      const result = calculateClipSuggestions(dataset({
        viewerSamples: timeline(
          [100, 100, 100, 100, 200, 400, 800, 1_600, 3_200, 6_400, 12_800],
          0,
          5,
          Array(11).fill(5),
        ),
      }));

      expect(result).toHaveLength(1);
      expect(result[0].durationMinutes).toBeLessThanOrEqual(
        ADVANCED_ANALYTICS_CONFIG.clips.maximumWindowIntervals * 5,
      );
      expect(result[0].signalDurationMinutes).toBeGreaterThan(result[0].durationMinutes);
    });

    test("a nearby marker adds explainability without making output unstable", () => {
      const viewerSamples = timeline(
        [100, 100, 102, 105, 190, 215, 180, 105, 100],
        0,
        2,
        [5, 5, 5, 6, 24, 34, 20, 6, 5],
      );
      const withoutMarker = calculateClipSuggestions(dataset({ viewerSamples }));
      const withMarker = calculateClipSuggestions(dataset({
        viewerSamples,
        markers: [marker(10, { label: "Manual marker" })],
      }));

      expect(withMarker).toEqual(calculateClipSuggestions(dataset({
        viewerSamples,
        markers: [marker(10, { label: "Manual marker" })],
      })));
      expect(withMarker.some((candidate) => candidate.marker?.label === "Manual marker")).toBe(true);
      expect(withMarker[0].reasons.length).toBeGreaterThanOrEqual(withoutMarker[0].reasons.length);
    });

    test("keeps an explicit saved marker as a review candidate on a flat timeline", () => {
      const result = calculateClipSuggestions(dataset({
        viewerSamples: timeline(Array(8).fill(100), 0, 2, Array(8).fill(5)),
        markers: [marker(8, { label: "Editorial marker" })],
      }));

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        score: expect.any(Number),
        marker: { label: "Editorial marker" },
      });
      expect(result[0].score).toBeGreaterThanOrEqual(ADVANCED_ANALYTICS_CONFIG.clips.markerMinimumScore);
      expect(result[0].reasons).toContain("marker-nearby");
    });

    test("returns no invented moments for absent or constant samples", () => {
      expect(calculateClipSuggestions(dataset({ viewerSamples: [] }))).toEqual([]);
      expect(calculateClipSuggestions(dataset({
        viewerSamples: timeline(Array(12).fill(100), 0, 2, Array(12).fill(5)),
      }))).toEqual([]);
    });
  });

  describe("event impact", () => {
    function impactDataset({ beforeViewers, afterViewers, beforeChat, afterChat, markerMinute = 20 }) {
      return dataset({
        viewerSamples: [
          sample(2, beforeViewers, beforeChat),
          sample(9, beforeViewers, beforeChat),
          sample(17, beforeViewers, beforeChat),
          sample(23, afterViewers, afterChat),
          sample(31, afterViewers, afterChat),
          sample(38, afterViewers, afterChat),
        ],
        markers: [marker(markerMinute, { eventId: "impact-marker", label: "Impact marker" })],
      });
    }

    test.each([
      ["positive", 100, 150, 5, 15],
      ["negative", 150, 90, 15, 5],
      ["mixed", 100, 150, 15, 5],
    ])("classifies a %s before/after change", (direction, beforeViewers, afterViewers, beforeChat, afterChat) => {
      const [result] = calculateEventImpact(impactDataset({
        beforeViewers,
        afterViewers,
        beforeChat,
        afterChat,
      }));

      expect(result).toMatchObject({
        eventId: "impact-marker",
        direction,
        dataPoints: { before: expect.any(Number), after: expect.any(Number) },
        explanation: { ru: expect.any(String), en: expect.any(String) },
      });
    });

    test("marks events at the beginning or end as insufficient when one window is absent", () => {
      const atBeginning = calculateEventImpact(dataset({
        viewerSamples: [sample(2, 100, 5), sample(5, 120, 8), sample(8, 130, 10)],
        markers: [marker(0, { eventId: "start" })],
      }));
      const atEnd = calculateEventImpact(dataset({
        viewerSamples: [sample(0, 100, 5), sample(3, 120, 8), sample(6, 130, 10)],
        markers: [marker(10, { eventId: "end" })],
      }));

      expect(atBeginning[0].direction).toBe("insufficient-data");
      expect(atBeginning[0].dataPoints.before).toBe(0);
      expect(atEnd[0].direction).toBe("insufficient-data");
      expect(atEnd[0].dataPoints.after).toBe(0);
    });

    test("handles zero baselines without infinite percentages", () => {
      const [result] = calculateEventImpact(impactDataset({
        beforeViewers: 0,
        afterViewers: 40,
        beforeChat: 0,
        afterChat: 8,
      }));

      expect(result.viewerPercent).toBeNull();
      expect(result.chatPercent).toBeNull();
      expect(JSON.stringify(result)).not.toMatch(/Infinity|NaN/);
    });

    test("uses timestamps for irregular sample intervals", () => {
      const [result] = calculateEventImpact(dataset({
        viewerSamples: [
          sample(1, 100, 4),
          sample(11, 105, 5),
          sample(18, 110, 6),
          sample(22, 150, 12),
          sample(37, 155, 14),
        ],
        markers: [marker(20, { eventId: "irregular" })],
      }));

      expect(result.direction).toBe("positive");
      expect(result.dataPoints.before).toBeGreaterThan(0);
      expect(result.dataPoints.after).toBeGreaterThan(0);
      expect(result.timeToPeakMinutes).toBeGreaterThanOrEqual(0);
    });

    test("treats a sample aligned with the marker as baseline, not post-event evidence", () => {
      const viewerSamples = Array.from({ length: 7 }, (_, minute) => (
        sample(minute, minute <= 3 ? 100 : 150, minute <= 3 ? 10 : 20)
      ));
      const [result] = calculateEventImpact(dataset({
        viewerSamples,
        markers: [marker(3, { eventId: "aligned" })],
      }));

      expect(result).toMatchObject({
        direction: "positive",
        viewersBefore: 100,
        viewersAfter: 150,
        dataPoints: { before: 3, after: 3 },
        effectDurationMinutes: null,
        effectObservedMinutes: 3,
        effectCensored: true,
      });
    });

    test("returns an empty list when there are no saved events", () => {
      expect(calculateEventImpact(dataset({ viewerSamples: timeline([100, 110, 120]) }))).toEqual([]);
    });
  });

  describe("aggregate viewer-curve retention", () => {
    test("keeps a smooth stable curve free of false drops", () => {
      const result = calculateRetention(dataset({
        viewerSamples: timeline([100, 101, 100, 99, 101, 100, 102, 101, 100, 99]),
      }));

      expect(result.dropCount).toBe(0);
      expect(result.recoveredDropCount).toBe(0);
      expect(result.drops).toEqual([]);
      expect(result.curve).toHaveLength(10);
    });

    test("does not label a monotonic growth window as a problematic decline", () => {
      const result = calculateRetention(dataset({
        viewerSamples: timeline([100, 110, 120, 130, 140]),
      }));

      expect(result.dropCount).toBe(0);
      expect(result.problemSegment).toBeNull();
      expect(result.stableSegment).not.toBeNull();
    });

    test("detects a sustained drop with full recovery", () => {
      const result = calculateRetention(dataset({
        viewerSamples: timeline([100, 101, 100, 99, 95, 78, 60, 64, 78, 92, 100, 102, 101]),
        markers: [marker(12, { label: "Drop marker" })],
        segments: [segment(8, 22, "Difficult segment")],
      }));

      expect(result.dropCount).toBeGreaterThanOrEqual(1);
      expect(result.recoveredDropCount).toBeGreaterThanOrEqual(1);
      expect(result.drops.some((drop) => drop.status === "recovered")).toBe(true);
      expect(result.largestDrop.dropPercent).toBeGreaterThan(0);
    });

    test("distinguishes partial recovery from no recovery", () => {
      const partial = calculateRetention(dataset({
        viewerSamples: timeline([100, 100, 101, 100, 92, 72, 58, 62, 70, 77, 81, 82]),
      }));
      const none = calculateRetention(dataset({
        viewerSamples: timeline([100, 101, 100, 98, 90, 70, 55, 52, 50, 49, 48, 47]),
      }));

      expect(partial.drops.some((drop) => drop.status === "partially-recovered")).toBe(true);
      expect(none.drops.some((drop) => drop.status === "not-recovered")).toBe(true);
    });

    test("does not count small noise as a drop", () => {
      const result = calculateRetention(dataset({
        viewerSamples: timeline([100, 98, 101, 97, 100, 99, 102, 98, 100, 101]),
      }));
      expect(result.dropCount).toBe(0);
    });

    test("does not spread one isolated bad sample into a sustained drop", () => {
      const result = calculateRetention(dataset({
        viewerSamples: timeline([100, 100, 100, 50, 100, 100, 100]),
      }));

      expect(result.dropCount).toBe(0);
      expect(result.drops).toEqual([]);
    });

    test("merges two nearby declines into one incident", () => {
      const result = calculateRetention(dataset({
        viewerSamples: timeline([100, 101, 100, 82, 70, 80, 74, 62, 65, 78, 94, 100, 101]),
      }));

      expect(result.dropCount).toBe(1);
      expect(result.drops).toHaveLength(1);
    });

    test("keeps merged drop end time and duration aligned with a later trough", () => {
      const result = calculateRetention(dataset({
        viewerSamples: timeline([100, 100, 100, 60, 60, 100, 100, 55, 55, 100, 100]),
      }));

      expect(result.drops).toHaveLength(1);
      expect(result.drops[0]).toMatchObject({
        startTime: "18:02",
        troughTime: "18:14",
        endTime: "18:18",
        durationMinutes: 16,
        status: "recovered",
      });
    });

    test("keeps a later unrecovered decline authoritative after nearby drops merge", () => {
      const result = calculateRetention(dataset({
        viewerSamples: timeline([100, 100, 100, 60, 60, 100, 100, 50, 50, 50, 50]),
      }));

      expect(result.drops).toHaveLength(1);
      expect(result.drops[0]).toMatchObject({
        startTime: "18:02",
        troughTime: "18:14",
        endTime: "18:20",
        status: "not-recovered",
        recoveryRatio: 0,
        recoveryTimeMinutes: null,
      });
    });

    test("applies full and partial recovery thresholds to the share of lost viewers regained", () => {
      const result = calculateRetention(dataset({
        viewerSamples: timeline([100, 100, 100, 60, 60, 90, 90, 90]),
      }));

      expect(result.drops).toHaveLength(1);
      expect(result.drops[0]).toMatchObject({
        status: "partially-recovered",
        recoveryRatio: 0.75,
        recoveryTimeMinutes: null,
      });
    });

    test("handles zero values without division errors", () => {
      const result = calculateRetention(dataset({
        viewerSamples: timeline([0, 0, 0, 0, 5, 0, 0, 4, 0]),
      }));

      expect(JSON.stringify(result)).not.toMatch(/Infinity|NaN/);
      expect(result.endVsStartPercent).toBeNull();
    });

    test("returns honest bounded results for one point and an empty timeline", () => {
      const onePoint = calculateRetention(dataset({ viewerSamples: [sample(0, 100, 5)] }));
      const empty = calculateRetention(dataset({ viewerSamples: [] }));

      expect(onePoint).toMatchObject({ startViewers: 100, endViewers: 100, dropCount: 0 });
      expect(onePoint.curve).toHaveLength(1);
      expect(empty).toMatchObject({ dropCount: 0, recoveredDropCount: 0, drops: [], curve: [] });
    });
  });
});
