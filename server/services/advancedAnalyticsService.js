import { loadAdvancedAnalyticsDataset } from "../repositories/advancedAnalyticsRepository.js";
import {
  formatTimelineTime,
  resolveTimelineTime,
} from "./streamTimeService.js";

const MINUTE_MS = 60_000;

export const ADVANCED_ANALYTICS_CONFIG = Object.freeze({
  loyalty: Object.freeze({
    minimumHistoryStreams: 3,
    recentStreamWindow: 5,
    regularMinimumStreams: 3,
    reactivationMinimumMissedStreams: 2,
    topParticipantLimit: 10,
  }),
  clips: Object.freeze({
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
  }),
  eventImpact: Object.freeze({
    baselinePoints: 3,
    postEventPoints: 3,
    extendedPostEventPoints: 6,
    minimumPointsPerSide: 2,
    notableChangeRatio: 0.08,
  }),
  retention: Object.freeze({
    smoothingPoints: 3,
    earlyPeriodRatio: 0.15,
    minimumDropRatio: 0.12,
    minimumConsecutivePoints: 2,
    mergeGapIntervals: 1.5,
    fullRecoveryRatio: 0.9,
    partialRecoveryRatio: 0.5,
    segmentWindowPoints: 3,
  }),
});

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function mean(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length
    ? finite.reduce((total, value) => total + value, 0) / finite.length
    : null;
}

function median(values) {
  const finite = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (!finite.length) return null;
  const middle = Math.floor(finite.length / 2);
  return finite.length % 2
    ? finite[middle]
    : (finite[middle - 1] + finite[middle]) / 2;
}

function percentageChange(after, before) {
  return Number.isFinite(before) && before !== 0 && Number.isFinite(after)
    ? round(((after - before) / Math.abs(before)) * 100)
    : null;
}

function absoluteChange(after, before) {
  return Number.isFinite(after) && Number.isFinite(before) ? round(after - before) : null;
}

function normalizedLogin(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function streamIdOf(stream) {
  return String(stream?.streamId ?? stream?.stream_id ?? "").trim();
}

function streamKnownAt(stream) {
  return stream?.startedAt
    ?? stream?.started_at
    ?? stream?.streamDate
    ?? stream?.stream_date
    ?? stream?.createdAt
    ?? stream?.created_at
    ?? null;
}

function selectedStreamId(dataset) {
  return streamIdOf(dataset?.stream);
}

function historyThroughSelected(dataset) {
  const selectedId = selectedStreamId(dataset);
  const streams = Array.isArray(dataset?.streams) ? dataset.streams.filter((stream) => streamIdOf(stream)) : [];
  const selectedIndex = streams.findIndex((stream) => streamIdOf(stream) === selectedId);
  return selectedIndex >= 0 ? streams.slice(0, selectedIndex + 1) : streams;
}

function participantRows(dataset) {
  const rows = [];
  for (const message of Array.isArray(dataset?.chatMessages) ? dataset.chatMessages : []) {
    rows.push({
      streamId: String(message?.streamId ?? message?.stream_id ?? "").trim(),
      login: normalizedLogin(message?.login ?? message?.chatter_login ?? message?.nickname),
      rowType: "message",
      firstKnownAt: message?.firstKnownAt
        ?? message?.timestamp
        ?? message?.sentAt
        ?? message?.sent_at
        ?? null,
      lastKnownAt: message?.lastKnownAt
        ?? message?.timestamp
        ?? message?.sentAt
        ?? message?.sent_at
        ?? null,
      aggregateCount: Number.isFinite(Number(message?.messageCount ?? message?.messages))
        ? Math.max(0, Number(message.messageCount ?? message.messages))
        : null,
    });
  }
  for (const chatter of [
    ...(Array.isArray(dataset?.chatters) ? dataset.chatters : []),
    ...(Array.isArray(dataset?.chatterParticipations) ? dataset.chatterParticipations : []),
  ]) {
    rows.push({
      streamId: String(chatter?.streamId ?? chatter?.stream_id ?? "").trim(),
      login: normalizedLogin(chatter?.login ?? chatter?.nickname),
      rowType: "chatter",
      firstKnownAt: chatter?.timestamp ?? chatter?.updatedAt ?? chatter?.updated_at ?? null,
      lastKnownAt: chatter?.timestamp ?? chatter?.updatedAt ?? chatter?.updated_at ?? null,
      aggregateCount: Number.isFinite(Number(chatter?.messageCount ?? chatter?.messages))
        ? Math.max(0, Number(chatter.messageCount ?? chatter.messages))
        : 0,
    });
  }
  return rows.filter((row) => row.streamId && row.login);
}

export function calculateLoyalty(dataset) {
  const config = ADVANCED_ANALYTICS_CONFIG.loyalty;
  const selectedId = selectedStreamId(dataset);
  const streams = historyThroughSelected(dataset);
  const streamIds = new Set(streams.map(streamIdOf));
  const counts = new Map();

  for (const row of participantRows(dataset)) {
    if (!streamIds.has(row.streamId)) continue;
    const key = `${row.streamId}\u0000${row.login}`;
    const current = counts.get(key) ?? {
      streamId: row.streamId,
      login: row.login,
      rawCount: 0,
      messageAggregateCount: 0,
      chatterAggregateCount: 0,
      messageTimestamps: [],
      chatterTimestamps: [],
    };
    if (row.rowType === "message") {
      if (row.aggregateCount === null) current.rawCount += 1;
      else current.messageAggregateCount += row.aggregateCount;
      if (row.firstKnownAt) current.messageTimestamps.push(row.firstKnownAt);
      if (row.lastKnownAt) current.messageTimestamps.push(row.lastKnownAt);
    } else {
      current.chatterAggregateCount += row.aggregateCount ?? 0;
      if (row.firstKnownAt) current.chatterTimestamps.push(row.firstKnownAt);
      if (row.lastKnownAt) current.chatterTimestamps.push(row.lastKnownAt);
    }
    counts.set(key, current);
  }

  const byLogin = new Map();
  for (const row of counts.values()) {
    const messageCount = Math.max(
      row.rawCount,
      row.messageAggregateCount,
      row.chatterAggregateCount,
    );
    if (messageCount <= 0) continue;
    const participant = byLogin.get(row.login) ?? {
      login: row.login,
      streams: new Map(),
    };
    const timestamps = row.messageTimestamps.length
      ? row.messageTimestamps
      : row.chatterTimestamps;
    participant.streams.set(row.streamId, {
      count: messageCount,
      timestamps,
    });
    byLogin.set(row.login, participant);
  }

  const currentParticipants = [...byLogin.values()]
    .filter((participant) => participant.streams.has(selectedId))
    .sort((first, second) => first.login.localeCompare(second.login));
  const isSufficient = streams.length >= config.minimumHistoryStreams;
  const recentStreamIds = streams.slice(-config.recentStreamWindow).map(streamIdOf);

  const participants = currentParticipants.map((participant) => {
    const attendedIds = streams
      .map(streamIdOf)
      .filter((streamId) => participant.streams.has(streamId));
    const priorIds = streams
      .slice(0, -1)
      .map(streamIdOf)
      .filter((streamId) => participant.streams.has(streamId));
    const recentAttendance = recentStreamIds.filter((streamId) => participant.streams.has(streamId)).length;
    let currentStreak = 0;
    for (let index = streams.length - 1; index >= 0; index -= 1) {
      if (!participant.streams.has(streamIdOf(streams[index]))) break;
      currentStreak += 1;
    }
    let missedBeforeReturn = 0;
    for (let index = streams.length - 2; index >= 0; index -= 1) {
      if (participant.streams.has(streamIdOf(streams[index]))) break;
      missedBeforeReturn += 1;
    }

    let category;
    if (!isSufficient) category = "insufficient-history";
    else if (!priorIds.length) category = "new";
    else if (missedBeforeReturn >= config.reactivationMinimumMissedStreams) category = "reactivated";
    else if (recentAttendance >= config.regularMinimumStreams) category = "regular";
    else category = "returning";

    const firstStream = streams.find((stream) => participant.streams.has(streamIdOf(stream)));
    const lastStream = [...streams].reverse().find((stream) => participant.streams.has(streamIdOf(stream)));
    const knownTimestamps = attendedIds
      .flatMap((streamId) => participant.streams.get(streamId)?.timestamps ?? [])
      .map((value) => ({ value, timestamp: Date.parse(value) }))
      .filter((item) => Number.isFinite(item.timestamp))
      .sort((first, second) => first.timestamp - second.timestamp);

    return {
      login: participant.login,
      streamsAttended: attendedIds.length,
      messagesInSelectedStream: participant.streams.get(selectedId)?.count ?? 0,
      firstKnownAt: knownTimestamps[0]?.value ?? streamKnownAt(firstStream),
      lastKnownAt: knownTimestamps.at(-1)?.value ?? streamKnownAt(lastStream),
      category,
      currentStreak,
    };
  }).sort((first, second) => (
    second.streamsAttended - first.streamsAttended
    || second.messagesInSelectedStream - first.messagesInSelectedStream
    || first.login.localeCompare(second.login)
  ));

  const countCategory = (category) => participants.filter((participant) => participant.category === category).length;
  const activeParticipants = participants.length;
  const share = (count) => activeParticipants ? round(count / activeParticipants, 4) : 0;
  const newParticipants = countCategory("new");
  const returningParticipants = countCategory("returning");
  const regularParticipants = countCategory("regular");
  const reactivatedParticipants = countCategory("reactivated");
  const knownParticipants = currentParticipants.filter((participant) => (
    streams.slice(0, -1).some((stream) => participant.streams.has(streamIdOf(stream)))
  )).length;
  const topParticipants = [...participants]
    .sort((first, second) => (
      second.streamsAttended - first.streamsAttended
      || second.currentStreak - first.currentStreak
      || second.messagesInSelectedStream - first.messagesInSelectedStream
      || first.login.localeCompare(second.login)
    ))
    .slice(0, config.topParticipantLimit);

  return {
    activeParticipants,
    newParticipants,
    newShare: share(newParticipants),
    returningParticipants,
    returningShare: share(returningParticipants),
    regularParticipants,
    regularShare: share(regularParticipants),
    reactivatedParticipants,
    reactivatedShare: share(reactivatedParticipants),
    insufficientHistoryParticipants: countCategory("insufficient-history"),
    knownParticipantsShare: share(knownParticipants),
    averageStreamsAttended: participants.length
      ? round(mean(participants.map((participant) => participant.streamsAttended)))
      : 0,
    historyStreamsUsed: streams.length,
    isSufficient,
    topParticipants,
    participants,
  };
}

function normalizeTimeline(dataset) {
  const startedAt = dataset?.stream?.started_at ?? dataset?.stream?.startedAt ?? null;
  const hasStreamAnchor = typeof startedAt === "string" && Number.isFinite(Date.parse(startedAt));
  const points = (Array.isArray(dataset?.viewerSamples) ? dataset.viewerSamples : [])
    .map((point, index) => {
      const timestamp = resolveTimelineTime(point, startedAt);
      const sourceTimestamp = point?.timestamp ?? point?.sampledAt ?? point?.sampled_at ?? null;
      const hasSourceTimestamp = typeof sourceTimestamp === "string"
        && Number.isFinite(Date.parse(sourceTimestamp));
      const viewers = Number(point?.viewers);
      const messagesPerMinute = Number(point?.messagesPerMinute ?? point?.messages_per_minute);
      if (!Number.isFinite(timestamp) || !Number.isFinite(viewers) || !Number.isFinite(messagesPerMinute)) return null;
      return {
        index,
        timestamp,
        time: point?.time ?? formatTimelineTime(timestamp),
        viewers,
        messagesPerMinute,
        hasSourceTimestamp,
        isAnchored: hasSourceTimestamp || hasStreamAnchor,
      };
    })
    .filter(Boolean)
    .sort((first, second) => first.timestamp - second.timestamp || first.index - second.index);
  const baseTimestamp = points[0]?.timestamp ?? null;
  return points.map((point) => ({
    ...point,
    elapsedMinutes: baseTimestamp === null ? 0 : (point.timestamp - baseTimestamp) / MINUTE_MS,
  }));
}

function normalizeMarkers(dataset) {
  const startedAt = dataset?.stream?.started_at ?? dataset?.stream?.startedAt ?? null;
  return (Array.isArray(dataset?.markers) ? dataset.markers : [])
    .map((marker, index) => {
      const timestamp = resolveTimelineTime(marker, startedAt);
      if (!Number.isFinite(timestamp)) return null;
      return {
        id: String(marker?.eventId ?? marker?.id ?? `marker-${index + 1}`),
        timestamp,
        time: marker?.time ?? formatTimelineTime(timestamp),
        label: String(marker?.label ?? "Stream event"),
        type: String(marker?.type ?? marker?.markerType ?? "stream-event"),
      };
    })
    .filter(Boolean)
    .sort((first, second) => first.timestamp - second.timestamp);
}

function normalizeSegments(dataset) {
  const startedAt = dataset?.stream?.started_at ?? dataset?.stream?.startedAt ?? null;
  return (Array.isArray(dataset?.segments) ? dataset.segments : [])
    .map((segment, index) => {
      const startTimestamp = resolveTimelineTime({ time: segment?.start }, startedAt);
      let endTimestamp = resolveTimelineTime({ time: segment?.end }, startedAt);
      if (!Number.isFinite(startTimestamp) || !Number.isFinite(endTimestamp)) return null;
      if (endTimestamp < startTimestamp) endTimestamp += 24 * 60 * MINUTE_MS;
      return {
        id: String(segment?.eventId ?? segment?.id ?? `segment-${index + 1}`),
        startTimestamp,
        endTimestamp,
        startTime: segment?.start ?? formatTimelineTime(startTimestamp),
        endTime: segment?.end ?? formatTimelineTime(endTimestamp),
        label: String(segment?.label ?? segment?.category ?? "Stream segment"),
      };
    })
    .filter(Boolean);
}

function cadenceMs(points) {
  return median(points.slice(1).map((point, index) => point.timestamp - points[index].timestamp)) ?? MINUTE_MS;
}

function rollingMean(points, index, field, windowPoints) {
  return mean(points.slice(Math.max(0, index - windowPoints), index).map((point) => point[field]));
}

function nearestWithin(items, timestamp, maximumDistance) {
  return items.reduce((nearest, item) => {
    const distance = Math.abs(item.timestamp - timestamp);
    if (distance > maximumDistance) return nearest;
    return !nearest || distance < nearest.distance ? { item, distance } : nearest;
  }, null)?.item ?? null;
}

function clipReasons(features) {
  const reasons = [];
  if (features.chatDeviation >= 0.5 || features.chatChange >= 0.5) reasons.push("chat-spike");
  if (features.viewerDeviation >= 0.5 && features.viewerDeviationDirection > 0) {
    reasons.push("viewer-spike");
  }
  if (
    features.viewerChange >= 0.5
    || (features.viewerDeviation >= 0.5 && features.viewerDeviationDirection < 0)
  ) {
    reasons.push("viewer-change");
  }
  if (features.concurrent) reasons.push("multi-signal");
  if (features.marker) reasons.push("marker-nearby");
  if (features.segmentStart) reasons.push("segment-start");
  if (features.durationStrength >= 1) reasons.push("sustained-spike");
  return reasons;
}

function clipText(reasons, peakTime) {
  const topicRu = reasons.includes("multi-signal")
    ? "одновременный всплеск онлайна и чата"
    : reasons.includes("chat-spike")
      ? "заметный всплеск активности чата"
      : reasons.includes("viewer-spike") || reasons.includes("viewer-change")
        ? "заметное изменение онлайна"
        : "сохранённый момент с повышенной активностью";
  const topicEn = reasons.includes("multi-signal")
    ? "a simultaneous viewer and chat spike"
    : reasons.includes("chat-spike")
      ? "a notable chat activity spike"
      : reasons.includes("viewer-spike") || reasons.includes("viewer-change")
        ? "a notable viewer-count change"
        : "a saved moment with elevated activity";
  return {
    ru: `Окно около ${peakTime}: ${topicRu}; проверьте его перед монтажом клипа.`,
    en: `Window around ${peakTime}: ${topicEn}; review it before editing a clip.`,
  };
}

export function calculateClipSuggestions(dataset) {
  const config = ADVANCED_ANALYTICS_CONFIG.clips;
  const points = normalizeTimeline(dataset);
  if (points.length < config.minimumSamples) return [];
  const markers = normalizeMarkers(dataset);
  const segments = normalizeSegments(dataset);
  const interval = cadenceMs(points);
  const absoluteTimestampShare = mean(points.map((point) => point.hasSourceTimestamp ? 1 : 0)) ?? 0;
  const candidates = [];
  const featureRows = [];

  for (let index = 1; index < points.length; index += 1) {
    const point = points[index];
    const previous = points[index - 1];
    const viewerBaselineWindow = points
      .slice(Math.max(0, index - config.rollingBaselinePoints), index)
      .map((item) => item.viewers);
    const viewerBaseline = rollingMean(points, index, "viewers", config.rollingBaselinePoints);
    const chatBaseline = rollingMean(points, index, "messagesPerMinute", config.rollingBaselinePoints);
    if (!Number.isFinite(viewerBaseline) || !Number.isFinite(chatBaseline)) continue;
    const viewerDeviationSignedRatio = (point.viewers - viewerBaseline) / Math.max(Math.abs(viewerBaseline), 1);
    const viewerFloorBaseline = Math.min(...viewerBaselineWindow);
    const viewerDropRatio = Math.max(
      0,
      (viewerFloorBaseline - point.viewers) / Math.max(Math.abs(viewerFloorBaseline), 1),
    );
    const viewerDeviationRatio = viewerDeviationSignedRatio >= 0
      ? viewerDeviationSignedRatio
      : viewerDropRatio;
    const chatDeviationRatio = Math.max(0, (point.messagesPerMinute - chatBaseline) / Math.max(Math.abs(chatBaseline), 1));
    const viewerChangeSignedRatio = (point.viewers - previous.viewers)
      / Math.max(Math.abs(previous.viewers), 1);
    const viewerChangeRatio = viewerChangeSignedRatio >= 0
      ? viewerChangeSignedRatio
      : viewerDropRatio >= config.viewerDeviationTarget * 0.5
        ? Math.abs(viewerChangeSignedRatio)
        : 0;
    const chatChangeRatio = Math.max(0, (point.messagesPerMinute - previous.messagesPerMinute) / Math.max(Math.abs(previous.messagesPerMinute), 1));
    const marker = nearestWithin(markers, point.timestamp, interval * config.markerProximityIntervals);
    const segmentStart = segments.find((segment) => (
      Math.abs(segment.startTimestamp - point.timestamp) <= interval * config.segmentProximityIntervals
    )) ?? null;
    const features = {
      viewerDeviation: clamp(viewerDeviationRatio / config.viewerDeviationTarget),
      viewerDeviationDirection: viewerDeviationSignedRatio >= 0
        ? Math.sign(viewerDeviationSignedRatio)
        : viewerDropRatio > 0 ? -1 : 0,
      chatDeviation: clamp(chatDeviationRatio / config.chatDeviationTarget),
      viewerChange: clamp(viewerChangeRatio / config.viewerChangeTarget),
      chatChange: clamp(chatChangeRatio / config.chatChangeTarget),
      marker,
      segmentStart,
      concurrent: viewerDeviationRatio >= config.viewerDeviationTarget * 0.5
        && viewerDeviationSignedRatio > 0
        && chatDeviationRatio >= config.chatDeviationTarget * 0.5,
      durationStrength: 0,
    };
    const viewerDirection = features.viewerDeviation >= 0.5
      ? features.viewerDeviationDirection
      : features.viewerChange >= 0.5
        ? Math.sign(viewerChangeSignedRatio)
        : 0;
    features.viewerDirection = viewerDirection > 0 ? "up" : viewerDirection < 0 ? "down" : "neutral";
    const qualifiesForSignal = (candidatePoint) => {
      const viewerDistance = Math.max(Math.abs(viewerBaseline), 1)
        * config.viewerDeviationTarget * 0.5;
      const chatDistance = Math.max(Math.abs(chatBaseline), 1)
        * config.chatDeviationTarget * 0.5;
      const viewerSignal = viewerDirection > 0
        ? candidatePoint.viewers >= viewerBaseline + viewerDistance
        : viewerDirection < 0
          && candidatePoint.viewers <= viewerBaseline - viewerDistance;
      const chatSignal = (
        features.chatDeviation >= 0.5 || features.chatChange >= 0.5
      ) && candidatePoint.messagesPerMinute >= chatBaseline + chatDistance;
      return viewerSignal || chatSignal;
    };
    let durationPoints = 0;
    for (
      let durationIndex = index;
      durationIndex < points.length && qualifiesForSignal(points[durationIndex]);
      durationIndex += 1
    ) {
      durationPoints += 1;
    }
    features.durationStrength = clamp(durationPoints / config.durationTargetPoints);
    featureRows.push({
      point,
      viewerBaseline,
      chatBaseline,
      features,
      durationPoints,
    });
  }

  for (const row of featureRows) {
    const { point, features, viewerBaseline, chatBaseline } = row;
    const baseScore = 100 * (
      features.viewerDeviation * 0.25
      + features.chatDeviation * 0.3
      + features.viewerChange * 0.15
      + features.chatChange * 0.1
      + (features.marker ? 0.1 : 0)
      + (features.concurrent ? 0.07 : 0)
      + (features.segmentStart ? 0.03 : 0)
    );
    const durationBonus = features.durationStrength * config.durationScoreWeight * 100;
    const contextFloor = features.marker ? config.markerMinimumScore : 0;
    const score = Math.min(100, Math.max(baseScore + durationBonus, contextFloor));
    if (score < config.minimumScore) continue;
    const reasons = clipReasons(features);
    const halfInterval = Math.max(MINUTE_MS / 2, interval / 2);
    candidates.push({
      startTimestamp: point.timestamp - halfInterval,
      endTimestamp: point.timestamp + halfInterval,
      peak: point,
      score,
      confidence: clamp(
        0.35
        + reasons.length * 0.07
        + Math.min(points.length, 20) / 100
        + absoluteTimestampShare * config.absoluteTimestampConfidenceWeight
        + features.durationStrength * 0.08,
      ),
      reasons,
      marker: features.marker,
      viewerBaseline,
      chatBaseline,
      durationPoints: row.durationPoints ?? 0,
      viewerDirection: features.viewerDirection,
    });
  }

  const chronological = candidates.sort((first, second) => first.startTimestamp - second.startTimestamp);
  const merged = [];
  for (const candidate of chronological) {
    const current = merged.at(-1);
    if (current && candidate.startTimestamp <= current.endTimestamp + interval * config.mergeGapIntervals) {
      current.endTimestamp = Math.max(current.endTimestamp, candidate.endTimestamp);
      current.startTimestamp = Math.min(current.startTimestamp, candidate.startTimestamp);
      if (candidate.score > current.peakCandidate.score) current.peakCandidate = candidate;
      current.reasons = [...new Set([...current.reasons, ...candidate.reasons])];
      current.marker ??= candidate.marker;
      current.confidence = Math.max(current.confidence, candidate.confidence);
    } else {
      merged.push({
        startTimestamp: candidate.startTimestamp,
        endTimestamp: candidate.endTimestamp,
        peakCandidate: candidate,
        reasons: [...candidate.reasons],
        marker: candidate.marker,
        confidence: candidate.confidence,
      });
    }
  }

  return merged
    .map((group) => {
      const candidate = group.peakCandidate;
      const peak = candidate.peak;
      const peakTime = peak.time ?? formatTimelineTime(peak.timestamp);
      const text = clipText(group.reasons, peakTime);
      const hasAbsoluteWindow = points.every((point) => point.isAnchored);
      const editorialHalfWindow = interval * config.maximumWindowIntervals / 2;
      const startTimestamp = Math.max(
        group.startTimestamp,
        peak.timestamp - editorialHalfWindow,
      );
      const endTimestamp = Math.min(
        group.endTimestamp,
        peak.timestamp + editorialHalfWindow,
      );
      return {
        startTime: hasAbsoluteWindow
          ? new Date(startTimestamp).toISOString()
          : formatTimelineTime(startTimestamp),
        peakTime: hasAbsoluteWindow
          ? new Date(peak.timestamp).toISOString()
          : peakTime,
        endTime: hasAbsoluteWindow
          ? new Date(endTimestamp).toISOString()
          : formatTimelineTime(endTimestamp),
        durationMinutes: round((endTimestamp - startTimestamp) / MINUTE_MS),
        signalDurationMinutes: round(
          Math.max(0, (candidate.durationPoints - 1) * interval) / MINUTE_MS,
        ),
        score: round(candidate.score, 1),
        confidence: round(group.confidence, 3),
        reasons: group.reasons,
        peakViewers: peak.viewers,
        peakMessagesPerMinute: peak.messagesPerMinute,
        viewerBaselineDelta: round(peak.viewers - candidate.viewerBaseline),
        viewerBaselinePercent: percentageChange(peak.viewers, candidate.viewerBaseline),
        viewerDirection: candidate.viewerDirection,
        chatBaselineDelta: round(peak.messagesPerMinute - candidate.chatBaseline),
        chatBaselinePercent: percentageChange(peak.messagesPerMinute, candidate.chatBaseline),
        marker: group.marker ? {
          id: group.marker.id,
          time: group.marker.time,
          label: group.marker.label,
          type: group.marker.type,
        } : null,
        text,
        time: peakTime,
        label: text.ru,
        type: "clip-suggestion",
        viewers: peak.viewers,
        messagesPerMinute: peak.messagesPerMinute,
      };
    })
    .sort((first, second) => second.score - first.score || first.peakTime.localeCompare(second.peakTime))
    .slice(0, config.maximumSuggestions);
}

function impactSignal(after, before, threshold) {
  if (!Number.isFinite(after) || !Number.isFinite(before)) return 0;
  if (before === 0) return after === 0 ? 0 : Math.sign(after);
  const ratio = (after - before) / Math.abs(before);
  return Math.abs(ratio) >= threshold ? Math.sign(ratio) : 0;
}

function impactDirection(viewerSignal, chatSignal) {
  if (viewerSignal > 0 && chatSignal > 0) return "positive";
  if (viewerSignal < 0 && chatSignal < 0) return "negative";
  if (viewerSignal !== 0 && chatSignal !== 0 && viewerSignal !== chatSignal) return "mixed";
  if (viewerSignal > 0 || chatSignal > 0) return "positive";
  if (viewerSignal < 0 || chatSignal < 0) return "negative";
  return "neutral";
}

function impactExplanation(direction) {
  const copy = {
    positive: {
      ru: "После события наблюдался рост сохранённых метрик; это корреляция, а не доказанная причина.",
      en: "The saved metrics increased after the event; this is correlation, not proven causation.",
    },
    negative: {
      ru: "Рядом с событием сохранённые метрики снизились; это корреляция, а не доказанная причина.",
      en: "The saved metrics decreased around the event; this is correlation, not proven causation.",
    },
    mixed: {
      ru: "После события онлайн и чат изменились в разных направлениях; причинная связь не устанавливается.",
      en: "Viewer count and chat moved in different directions after the event; no causation is established.",
    },
    neutral: {
      ru: "Рядом с событием не зафиксировано заметного устойчивого изменения сохранённых метрик.",
      en: "No notable sustained change in the saved metrics was observed around the event.",
    },
    "insufficient-data": {
      ru: "До или после события недостаточно сохранённых точек для ответственной оценки.",
      en: "There are not enough saved points before or after the event for a responsible estimate.",
    },
  };
  return copy[direction];
}

export function calculateEventImpact(dataset) {
  const config = ADVANCED_ANALYTICS_CONFIG.eventImpact;
  const points = normalizeTimeline(dataset);
  const markers = normalizeMarkers(dataset);
  if (!markers.length) return [];
  const interval = cadenceMs(points);
  const beforeWindow = interval * config.baselinePoints;
  const afterWindow = interval * config.postEventPoints;
  const extendedWindow = interval * config.extendedPostEventPoints;

  return markers.map((marker) => {
    const before = points.filter((point) => (
      point.timestamp < marker.timestamp && point.timestamp >= marker.timestamp - beforeWindow
    ));
    const after = points.filter((point) => (
      point.timestamp > marker.timestamp && point.timestamp <= marker.timestamp + afterWindow
    ));
    const extendedAfter = points.filter((point) => (
      point.timestamp > marker.timestamp && point.timestamp <= marker.timestamp + extendedWindow
    ));
    const viewersBefore = mean(before.map((point) => point.viewers));
    const viewersAfter = mean(after.map((point) => point.viewers));
    const chatBefore = mean(before.map((point) => point.messagesPerMinute));
    const chatAfter = mean(after.map((point) => point.messagesPerMinute));
    const enough = before.length >= config.minimumPointsPerSide && after.length >= config.minimumPointsPerSide;
    const viewerSignal = impactSignal(viewersAfter, viewersBefore, config.notableChangeRatio);
    const chatSignal = impactSignal(chatAfter, chatBefore, config.notableChangeRatio);
    const direction = enough ? impactDirection(viewerSignal, chatSignal) : "insufficient-data";
    const viewerPeak = extendedAfter.reduce((best, point) => (
      !best || point.viewers > best.viewers ? point : best
    ), null);
    const chatPeak = extendedAfter.reduce((best, point) => (
      !best || point.messagesPerMinute > best.messagesPerMinute ? point : best
    ), null);
    let effectEnd = null;
    let effectCensored = false;
    let effectObservedMinutes = null;
    if (enough && extendedAfter.length) {
      const viewerTolerance = Math.abs(viewersBefore || 0) * config.notableChangeRatio;
      const chatTolerance = Math.abs(chatBefore || 0) * config.notableChangeRatio;
      const firstNotableIndex = extendedAfter.findIndex((point) => (
        Math.abs(point.viewers - (viewersBefore ?? point.viewers)) > viewerTolerance
        || Math.abs(point.messagesPerMinute - (chatBefore ?? point.messagesPerMinute)) > chatTolerance
      ));
      if (firstNotableIndex >= 0) {
        effectEnd = extendedAfter.slice(firstNotableIndex + 1).find((point) => (
          Math.abs(point.viewers - (viewersBefore ?? point.viewers)) <= viewerTolerance
          && Math.abs(point.messagesPerMinute - (chatBefore ?? point.messagesPerMinute)) <= chatTolerance
        )) ?? null;
        if (!effectEnd) {
          effectCensored = true;
          effectObservedMinutes = round(
            (extendedAfter.at(-1).timestamp - marker.timestamp) / MINUTE_MS,
          );
        }
      }
    }
    const minimumSide = Math.min(before.length, after.length);
    const confidence = enough
      ? clamp(0.55 + Math.min(minimumSide, 4) * 0.1)
      : clamp(minimumSide / config.minimumPointsPerSide * 0.4);

    return {
      eventId: marker.id,
      time: marker.time,
      label: marker.label,
      type: marker.type,
      viewersBefore: round(viewersBefore),
      viewersAfter: round(viewersAfter),
      viewerDelta: absoluteChange(viewersAfter, viewersBefore),
      viewerPercent: percentageChange(viewersAfter, viewersBefore),
      chatBefore: round(chatBefore),
      chatAfter: round(chatAfter),
      chatDelta: absoluteChange(chatAfter, chatBefore),
      chatPercent: percentageChange(chatAfter, chatBefore),
      maxViewersAfter: viewerPeak?.viewers ?? null,
      maxChatAfter: chatPeak?.messagesPerMinute ?? null,
      timeToPeakMinutes: viewerPeak ? round((viewerPeak.timestamp - marker.timestamp) / MINUTE_MS) : null,
      effectDurationMinutes: effectEnd ? round((effectEnd.timestamp - marker.timestamp) / MINUTE_MS) : null,
      effectObservedMinutes,
      effectCensored,
      direction,
      confidence: round(confidence, 3),
      explanation: impactExplanation(direction),
      dataPoints: {
        before: before.length,
        after: after.length,
      },
    };
  });
}

function smoothTimeline(points, windowPoints) {
  const radius = Math.floor(windowPoints / 2);
  return points.map((point, index) => ({
    ...point,
    smoothedViewers: mean(points
      .slice(Math.max(0, index - radius), Math.min(points.length, index + radius + 1))
      .map((item) => item.viewers)),
  }));
}

function retentionEmpty() {
  return {
    startViewers: null,
    endViewers: null,
    averageViewers: null,
    peakViewers: null,
    endVsStartPercent: null,
    earlyBaselineViewers: null,
    changeFromEarlyBaselinePercent: null,
    largestDrop: null,
    dropCount: 0,
    recoveredDropCount: 0,
    stableSegment: null,
    problemSegment: null,
    curve: [],
    drops: [],
  };
}

function relatedMarkers(markers, startTimestamp, endTimestamp) {
  return markers
    .filter((marker) => marker.timestamp >= startTimestamp && marker.timestamp <= endTimestamp)
    .map((marker) => ({
      id: marker.id,
      time: marker.time,
      label: marker.label,
      type: marker.type,
    }));
}

function relatedSegments(segments, startTimestamp, endTimestamp) {
  return segments
    .filter((segment) => segment.endTimestamp >= startTimestamp && segment.startTimestamp <= endTimestamp)
    .map((segment) => ({
      id: segment.id,
      startTime: segment.startTime,
      endTime: segment.endTime,
      label: segment.label,
    }));
}

function describeCurveSegments(points) {
  const size = ADVANCED_ANALYTICS_CONFIG.retention.segmentWindowPoints;
  if (points.length < 2) return { stableSegment: null, problemSegment: null };
  const windows = [];
  for (let start = 0; start < points.length - 1; start += 1) {
    const items = points.slice(start, Math.min(points.length, start + size));
    if (items.length < 2) continue;
    const averageViewers = mean(items.map((point) => point.viewers));
    const changePercent = percentageChange(items.at(-1).viewers, items[0].viewers);
    const rangeRatio = averageViewers
      ? (Math.max(...items.map((point) => point.viewers)) - Math.min(...items.map((point) => point.viewers)))
        / Math.abs(averageViewers)
      : 0;
    windows.push({
      startTime: items[0].time,
      endTime: items.at(-1).time,
      averageViewers: round(averageViewers),
      changePercent,
      volatility: rangeRatio,
    });
  }
  const stable = [...windows].sort((first, second) => (
    first.volatility - second.volatility
    || Math.abs(first.changePercent ?? 0) - Math.abs(second.changePercent ?? 0)
  ))[0] ?? null;
  const problem = windows.filter((window) => (window.changePercent ?? 0) < 0).sort((first, second) => (
    (first.changePercent ?? 0) - (second.changePercent ?? 0)
    || second.volatility - first.volatility
  ))[0] ?? null;
  return {
    stableSegment: stable ? {
      startTime: stable.startTime,
      endTime: stable.endTime,
      averageViewers: stable.averageViewers,
      text: {
        ru: "Наиболее устойчивый отрезок сохранённой кривой.",
        en: "The most stable segment of the saved viewer curve.",
      },
    } : null,
    problemSegment: problem ? {
      startTime: problem.startTime,
      endTime: problem.endTime,
      averageViewers: problem.averageViewers,
      text: {
        ru: "Отрезок с самым заметным снижением сохранённой кривой.",
        en: "The segment with the most notable decline in the saved viewer curve.",
      },
    } : null,
  };
}

function mergeDrops(drops, maximumGap, points, config) {
  const groups = [];
  for (const drop of drops) {
    const previous = groups.at(-1);
    if (previous && drop.startTimestamp <= previous.endTimestamp + maximumGap) {
      previous.endTimestamp = Math.max(previous.endTimestamp, drop.endTimestamp);
      previous.members.push(drop);
    } else {
      groups.push({
        startTimestamp: drop.startTimestamp,
        endTimestamp: drop.endTimestamp,
        members: [drop],
      });
    }
  }

  return groups.map((group) => {
    const startIndex = points.findIndex((point) => point.timestamp === group.startTimestamp);
    let endIndex = points.findIndex((point) => point.timestamp === group.endTimestamp);
    if (startIndex < 0) return group.members[0];
    if (endIndex < startIndex) endIndex = points.length - 1;
    let troughIndex = startIndex;
    for (let index = startIndex + 1; index <= endIndex; index += 1) {
      if (points[index].viewers < points[troughIndex].viewers) troughIndex = index;
    }

    const startPoint = points[startIndex];
    const troughPoint = points[troughIndex];
    const endPoint = points[endIndex];
    const loss = Math.max(0, startPoint.viewers - troughPoint.viewers);
    const postTrough = points.slice(troughIndex, endIndex + 1);
    const maximumAfterTrough = Math.max(...postTrough.map((point) => point.viewers));
    const maximumRecovery = Math.max(0, maximumAfterTrough - troughPoint.viewers);
    const terminalRecovery = Math.max(0, endPoint.viewers - troughPoint.viewers);
    const recoveryRatio = loss > 0 ? clamp(terminalRecovery / loss) : 0;
    const status = recoveryRatio >= config.fullRecoveryRatio
      ? "recovered"
      : recoveryRatio >= config.partialRecoveryRatio
        ? "partially-recovered"
        : "not-recovered";
    const fullRecoveryViewerThreshold = troughPoint.viewers + loss * config.fullRecoveryRatio;
    let stableRecoveryIndex = null;
    if (status === "recovered") {
      for (let index = troughIndex + 1; index <= endIndex; index += 1) {
        if (
          points[index].viewers >= fullRecoveryViewerThreshold
          && points.slice(index, endIndex + 1)
            .every((point) => point.viewers >= fullRecoveryViewerThreshold)
        ) {
          stableRecoveryIndex = index;
          break;
        }
      }
    }

    return {
      startTimestamp: startPoint.timestamp,
      troughTimestamp: troughPoint.timestamp,
      endTimestamp: endPoint.timestamp,
      startTime: startPoint.time,
      troughTime: troughPoint.time,
      endTime: endPoint.time,
      dropViewers: round(loss),
      dropPercent: startPoint.viewers > 0 ? round((loss / startPoint.viewers) * 100) : null,
      durationMinutes: round((endPoint.timestamp - startPoint.timestamp) / MINUTE_MS),
      maxRecovery: round(maximumRecovery),
      recoveryRatio: round(recoveryRatio, 3),
      recoveryTimeMinutes: stableRecoveryIndex === null
        ? null
        : round((points[stableRecoveryIndex].timestamp - troughPoint.timestamp) / MINUTE_MS),
      status,
    };
  });
}

export function calculateRetention(dataset) {
  const config = ADVANCED_ANALYTICS_CONFIG.retention;
  const rawPoints = normalizeTimeline(dataset);
  if (!rawPoints.length) return retentionEmpty();
  const points = smoothTimeline(rawPoints, config.smoothingPoints);
  const markers = normalizeMarkers(dataset);
  const segments = normalizeSegments(dataset);
  const interval = cadenceMs(points);
  const drops = [];
  let peakIndex = 0;
  let index = 1;

  while (index < points.length) {
    if (points[index].smoothedViewers >= points[peakIndex].smoothedViewers) {
      peakIndex = index;
      index += 1;
      continue;
    }
    const peakValue = points[peakIndex].smoothedViewers;
    const belowThreshold = peakValue > 0
      && (peakValue - points[index].smoothedViewers) / peakValue >= config.minimumDropRatio;
    if (!belowThreshold) {
      index += 1;
      continue;
    }
    let belowCount = 0;
    let rawBelowRun = 0;
    let maximumRawBelowRun = 0;
    let cursor = index;
    while (
      cursor < points.length
      && peakValue > 0
      && (peakValue - points[cursor].smoothedViewers) / peakValue >= config.minimumDropRatio
    ) {
      belowCount += 1;
      if ((peakValue - points[cursor].viewers) / peakValue >= config.minimumDropRatio) {
        rawBelowRun += 1;
        maximumRawBelowRun = Math.max(maximumRawBelowRun, rawBelowRun);
      } else {
        rawBelowRun = 0;
      }
      cursor += 1;
    }
    if (
      belowCount < config.minimumConsecutivePoints
      || maximumRawBelowRun < config.minimumConsecutivePoints
    ) {
      index = cursor;
      continue;
    }

    const startPoint = points[peakIndex];
    let troughIndex = index;
    let recoveryIndex = null;
    for (let scan = index; scan < points.length; scan += 1) {
      if (points[scan].viewers < points[troughIndex].viewers) troughIndex = scan;
      const lossAtScan = Math.max(0, startPoint.viewers - points[troughIndex].viewers);
      const fullRecoveryViewerThreshold = points[troughIndex].viewers
        + lossAtScan * config.fullRecoveryRatio;
      if (scan > troughIndex && points[scan].viewers >= fullRecoveryViewerThreshold) {
        recoveryIndex = scan;
        break;
      }
    }
    const endIndex = recoveryIndex ?? points.length - 1;
    const troughPoint = points[troughIndex];
    const postTrough = points.slice(troughIndex, endIndex + 1);
    const maximumAfterTrough = Math.max(...postTrough.map((point) => point.viewers));
    const loss = Math.max(0, startPoint.viewers - troughPoint.viewers);
    const maximumRecovery = Math.max(0, maximumAfterTrough - troughPoint.viewers);
    const recoveryRatio = loss > 0 ? maximumRecovery / loss : 0;
    const status = recoveryIndex !== null
      ? "recovered"
      : recoveryRatio >= config.partialRecoveryRatio
        ? "partially-recovered"
        : "not-recovered";
    drops.push({
      startTimestamp: startPoint.timestamp,
      troughTimestamp: troughPoint.timestamp,
      endTimestamp: points[endIndex].timestamp,
      startTime: startPoint.time,
      troughTime: troughPoint.time,
      endTime: points[endIndex].time,
      dropViewers: round(loss),
      dropPercent: startPoint.viewers > 0 ? round((loss / startPoint.viewers) * 100) : null,
      durationMinutes: round((points[endIndex].timestamp - startPoint.timestamp) / MINUTE_MS),
      maxRecovery: round(maximumRecovery),
      recoveryRatio: round(recoveryRatio, 3),
      recoveryTimeMinutes: recoveryIndex !== null
        ? round((points[recoveryIndex].timestamp - troughPoint.timestamp) / MINUTE_MS)
        : null,
      status,
    });
    if (recoveryIndex !== null) {
      peakIndex = recoveryIndex;
      index = recoveryIndex + 1;
    } else {
      break;
    }
  }

  const merged = mergeDrops(drops, interval * config.mergeGapIntervals, points, config).map((drop) => ({
    startTime: drop.startTime,
    troughTime: drop.troughTime,
    endTime: drop.endTime,
    dropViewers: drop.dropViewers,
    dropPercent: drop.dropPercent,
    durationMinutes: drop.durationMinutes,
    maxRecovery: drop.maxRecovery,
    recoveryRatio: drop.recoveryRatio,
    recoveryTimeMinutes: drop.recoveryTimeMinutes,
    relatedMarkers: relatedMarkers(markers, drop.startTimestamp, drop.endTimestamp),
    relatedSegments: relatedSegments(segments, drop.startTimestamp, drop.endTimestamp),
    status: drop.status,
  }));
  const firstTimestamp = points[0].timestamp;
  const duration = points.at(-1).timestamp - firstTimestamp;
  const earlyCutoff = firstTimestamp + duration * config.earlyPeriodRatio;
  let earlyPoints = points.filter((point) => point.timestamp <= earlyCutoff);
  if (earlyPoints.length < Math.min(2, points.length)) earlyPoints = points.slice(0, Math.min(2, points.length));
  const earlyBaselineViewers = mean(earlyPoints.map((point) => point.viewers));
  const largestDrop = [...merged].sort((first, second) => (
    (second.dropPercent ?? 0) - (first.dropPercent ?? 0)
    || (second.dropViewers ?? 0) - (first.dropViewers ?? 0)
  ))[0] ?? null;
  const curveSegments = describeCurveSegments(points);

  return {
    startViewers: points[0].viewers,
    endViewers: points.at(-1).viewers,
    averageViewers: round(mean(points.map((point) => point.viewers))),
    peakViewers: Math.max(...points.map((point) => point.viewers)),
    endVsStartPercent: percentageChange(points.at(-1).viewers, points[0].viewers),
    earlyBaselineViewers: round(earlyBaselineViewers),
    changeFromEarlyBaselinePercent: percentageChange(points.at(-1).viewers, earlyBaselineViewers),
    largestDrop,
    dropCount: merged.length,
    recoveredDropCount: merged.filter((drop) => drop.status === "recovered").length,
    stableSegment: curveSegments.stableSegment,
    problemSegment: curveSegments.problemSegment,
    curve: points.map((point) => ({
      time: point.time,
      elapsedMinutes: round(point.elapsedMinutes),
      viewers: point.viewers,
      smoothedViewers: round(point.smoothedViewers),
    })),
    drops: merged,
  };
}

function hasAbsoluteTimestamp(item) {
  if (Number(item?.missingTimestampCount) > 0) return false;
  const value = item?.timestamp
    ?? item?.sampledAt
    ?? item?.sentAt
    ?? item?.occurredAt
    ?? item?.firstKnownAt
    ?? item?.lastKnownAt;
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function calculateDataQuality(dataset, loyalty) {
  const viewerSamples = Array.isArray(dataset?.viewerSamples) ? dataset.viewerSamples.length : 0;
  const messageRows = Array.isArray(dataset?.chatMessages) ? dataset.chatMessages : [];
  const messages = Number.isFinite(dataset?.messageRowCount)
    ? dataset.messageRowCount
    : messageRows.reduce((total, message) => {
      const aggregateCount = Number(message?.messageCount ?? message?.messages);
      return total + (Number.isFinite(aggregateCount) ? Math.max(0, aggregateCount) : 1);
    }, 0);
  const selectedId = selectedStreamId(dataset);
  const uniqueChatters = new Set(participantRows(dataset)
    .filter((row) => row.streamId === selectedId)
    .map((row) => row.login)).size;
  const markers = Array.isArray(dataset?.markers) ? dataset.markers.length : 0;
  const historicalStreams = historyThroughSelected(dataset).length;
  const timestampItems = [
    ...(Array.isArray(dataset?.viewerSamples) ? dataset.viewerSamples : []),
    ...messageRows,
    ...(Array.isArray(dataset?.markers) ? dataset.markers : []),
  ];
  const hasAbsoluteTimestamps = timestampItems.length > 0 && timestampItems.every(hasAbsoluteTimestamp);
  const startedAt = dataset?.stream?.started_at ?? dataset?.stream?.startedAt ?? null;
  const collectedFrom = dataset?.stream?.collected_from ?? dataset?.stream?.collectedFrom ?? null;
  const startedTime = typeof startedAt === "string" ? Date.parse(startedAt) : Number.NaN;
  const collectedTime = typeof collectedFrom === "string" ? Date.parse(collectedFrom) : Number.NaN;
  const collectedPeriodOnly = Number.isFinite(startedTime)
    && Number.isFinite(collectedTime)
    && collectedTime > startedTime + 1_000;
  const warnings = [];
  if (!viewerSamples) warnings.push("no-viewer-samples");
  else if (viewerSamples < ADVANCED_ANALYTICS_CONFIG.clips.minimumSamples) warnings.push("limited-viewer-samples");
  if (!messages) warnings.push("no-chat-messages");
  if (!loyalty.isSufficient) warnings.push("insufficient-chat-history");
  if (!hasAbsoluteTimestamps) warnings.push("missing-absolute-timestamps");
  if (collectedPeriodOnly) warnings.push("collection-started-late");
  if (!markers) warnings.push("no-markers");
  const status = viewerSamples < 2 && uniqueChatters === 0
    ? "insufficient"
    : warnings.length
      ? "partial"
      : "complete";
  return {
    status,
    warnings,
    viewerSamples,
    messages,
    uniqueChatters,
    markers,
    historicalStreams,
    hasAbsoluteTimestamps,
    collectedFrom,
    collectedPeriodOnly,
  };
}

export function buildAdvancedAnalytics(dataset, { generatedAt = new Date().toISOString() } = {}) {
  const loyalty = calculateLoyalty(dataset);
  return {
    streamId: selectedStreamId(dataset),
    channelId: dataset?.stream?.channel_id ?? dataset?.stream?.channelId ?? null,
    source: dataset?.stream?.source ?? null,
    generatedAt,
    dataQuality: calculateDataQuality(dataset, loyalty),
    loyalty,
    clipSuggestions: calculateClipSuggestions(dataset),
    eventImpact: calculateEventImpact(dataset),
    retention: calculateRetention(dataset),
  };
}

export function getAdvancedStreamAnalytics(streamId, options = {}) {
  const dataset = loadAdvancedAnalyticsDataset(streamId, options);
  return dataset ? buildAdvancedAnalytics(dataset) : null;
}
