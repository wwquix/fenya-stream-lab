import { useCallback, useEffect, useMemo, useState } from 'react'
import { createMockAdvancedAnalytics } from '../data/mockAdvancedAnalytics.js'

const DATA_QUALITY_STATUSES = new Set(['complete', 'partial', 'insufficient'])

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}

function normalizeString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function normalizeInteger(value) {
  const number = normalizeNumber(value)
  return number === null ? null : Math.max(0, Math.round(number))
}

function normalizeBoolean(value) {
  return typeof value === 'boolean' ? value : null
}

function normalizeScalar(value) {
  return normalizeNumber(value) ?? normalizeString(value)
}

function normalizeLocalizedText(value) {
  const text = asObject(value)
  if (!text) return null
  const ru = normalizeString(text.ru)
  const en = normalizeString(text.en)
  return ru || en ? { ru, en } : null
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return []
  return value.map(normalizeString).filter(Boolean)
}

function normalizeRelatedItem(value) {
  if (typeof value === 'string') return normalizeString(value)
  const item = asObject(value)
  if (!item) return null
  return {
    id: normalizeString(item.id ?? item.eventId ?? item.segmentId),
    time: normalizeString(item.time ?? item.timeLabel),
    startTime: normalizeString(item.startTime ?? item.start),
    endTime: normalizeString(item.endTime ?? item.end),
    label: normalizeString(item.label ?? item.name ?? item.category),
    type: normalizeString(item.type),
  }
}

function normalizeRelatedList(value) {
  if (!Array.isArray(value)) return []
  return value.map(normalizeRelatedItem).filter(Boolean)
}

function normalizeDataQuality(value) {
  const quality = asObject(value) ?? {}
  const status = normalizeString(quality.status)
  return {
    status: DATA_QUALITY_STATUSES.has(status) ? status : 'insufficient',
    warnings: normalizeStringArray(quality.warnings),
    viewerSamples: normalizeInteger(quality.viewerSamples),
    messages: normalizeInteger(quality.messages),
    uniqueChatters: normalizeInteger(quality.uniqueChatters),
    markers: normalizeInteger(quality.markers),
    historicalStreams: normalizeInteger(quality.historicalStreams),
    hasAbsoluteTimestamps: normalizeBoolean(quality.hasAbsoluteTimestamps),
    collectedFrom: normalizeString(quality.collectedFrom),
    collectedPeriodOnly: normalizeBoolean(quality.collectedPeriodOnly) ?? false,
  }
}

function normalizeParticipant(value) {
  const participant = asObject(value)
  if (!participant) return null
  const login = normalizeString(participant.login)
  if (!login) return null
  return {
    login,
    streamsAttended: normalizeInteger(participant.streamsAttended),
    messagesInSelectedStream: normalizeInteger(participant.messagesInSelectedStream),
    firstKnownAt: normalizeString(participant.firstKnownAt),
    lastKnownAt: normalizeString(participant.lastKnownAt),
    category: normalizeString(participant.category),
    currentStreak: normalizeInteger(participant.currentStreak),
  }
}

function normalizeLoyalty(value) {
  const loyalty = asObject(value)
  if (!loyalty || Object.keys(loyalty).length === 0) return null
  return {
    activeParticipants: normalizeInteger(loyalty.activeParticipants),
    newParticipants: normalizeInteger(loyalty.newParticipants),
    newShare: normalizeNumber(loyalty.newShare),
    returningParticipants: normalizeInteger(loyalty.returningParticipants),
    returningShare: normalizeNumber(loyalty.returningShare),
    regularParticipants: normalizeInteger(loyalty.regularParticipants),
    regularShare: normalizeNumber(loyalty.regularShare),
    reactivatedParticipants: normalizeInteger(loyalty.reactivatedParticipants),
    reactivatedShare: normalizeNumber(loyalty.reactivatedShare),
    insufficientHistoryParticipants: normalizeInteger(loyalty.insufficientHistoryParticipants),
    knownParticipantsShare: normalizeNumber(loyalty.knownParticipantsShare),
    averageStreamsAttended: normalizeNumber(loyalty.averageStreamsAttended),
    historyStreamsUsed: normalizeInteger(loyalty.historyStreamsUsed),
    isSufficient: normalizeBoolean(loyalty.isSufficient) ?? false,
    topParticipants: Array.isArray(loyalty.topParticipants)
      ? loyalty.topParticipants.map(normalizeParticipant).filter(Boolean)
      : [],
    participants: Array.isArray(loyalty.participants)
      ? loyalty.participants.map(normalizeParticipant).filter(Boolean)
      : [],
  }
}

function normalizeMarker(value) {
  if (typeof value === 'string') return { label: normalizeString(value) }
  const marker = asObject(value)
  if (!marker) return null
  return {
    id: normalizeString(marker.id ?? marker.eventId),
    time: normalizeString(marker.time ?? marker.timeLabel),
    label: normalizeString(marker.label),
    type: normalizeString(marker.type),
  }
}

function normalizeClipSuggestion(value) {
  const clip = asObject(value)
  if (!clip) return null
  return {
    startTime: normalizeString(clip.startTime ?? clip.time),
    peakTime: normalizeString(clip.peakTime ?? clip.time),
    endTime: normalizeString(clip.endTime ?? clip.time),
    durationMinutes: normalizeNumber(clip.durationMinutes),
    signalDurationMinutes: normalizeNumber(clip.signalDurationMinutes),
    score: normalizeNumber(clip.score),
    confidence: normalizeScalar(clip.confidence),
    reasons: normalizeStringArray(clip.reasons),
    peakViewers: normalizeInteger(clip.peakViewers ?? clip.viewers),
    peakMessagesPerMinute: normalizeNumber(clip.peakMessagesPerMinute ?? clip.messagesPerMinute),
    viewerBaselineDelta: normalizeNumber(clip.viewerBaselineDelta),
    viewerBaselinePercent: normalizeNumber(clip.viewerBaselinePercent),
    viewerDirection: normalizeString(clip.viewerDirection),
    chatBaselineDelta: normalizeNumber(clip.chatBaselineDelta),
    chatBaselinePercent: normalizeNumber(clip.chatBaselinePercent),
    marker: normalizeMarker(clip.marker),
    text: normalizeLocalizedText(clip.text),
    time: normalizeString(clip.time),
    label: normalizeString(clip.label),
    type: normalizeString(clip.type),
    viewers: normalizeInteger(clip.viewers),
    messagesPerMinute: normalizeNumber(clip.messagesPerMinute),
  }
}

function normalizeEventImpact(value) {
  const impact = asObject(value)
  if (!impact) return null
  const dataPoints = asObject(impact.dataPoints) ?? {}
  return {
    eventId: normalizeString(impact.eventId ?? impact.id),
    time: normalizeString(impact.time ?? impact.timeLabel),
    label: normalizeString(impact.label),
    type: normalizeString(impact.type),
    direction: normalizeString(impact.direction),
    confidence: normalizeScalar(impact.confidence),
    viewersBefore: normalizeNumber(impact.viewersBefore),
    viewersAfter: normalizeNumber(impact.viewersAfter),
    viewerDelta: normalizeNumber(impact.viewerDelta),
    viewerPercent: normalizeNumber(impact.viewerPercent),
    chatBefore: normalizeNumber(impact.chatBefore),
    chatAfter: normalizeNumber(impact.chatAfter),
    chatDelta: normalizeNumber(impact.chatDelta),
    chatPercent: normalizeNumber(impact.chatPercent),
    maxViewersAfter: normalizeNumber(impact.maxViewersAfter),
    maxChatAfter: normalizeNumber(impact.maxChatAfter),
    timeToPeakMinutes: normalizeNumber(impact.timeToPeakMinutes),
    effectDurationMinutes: normalizeNumber(impact.effectDurationMinutes),
    effectObservedMinutes: normalizeNumber(impact.effectObservedMinutes),
    effectCensored: normalizeBoolean(impact.effectCensored) ?? false,
    dataPoints: {
      before: normalizeInteger(dataPoints.before),
      after: normalizeInteger(dataPoints.after),
    },
    explanation: normalizeLocalizedText(impact.explanation),
  }
}

function normalizeCurvePoint(value) {
  const point = asObject(value)
  if (!point) return null
  const time = normalizeString(point.time)
  const viewers = normalizeNumber(point.viewers)
  if (!time || viewers === null) return null
  return {
    time,
    elapsedMinutes: normalizeNumber(point.elapsedMinutes),
    viewers,
    smoothedViewers: normalizeNumber(point.smoothedViewers),
  }
}

function normalizeDrop(value) {
  const drop = asObject(value)
  if (!drop) return null
  return {
    startTime: normalizeString(drop.startTime),
    troughTime: normalizeString(drop.troughTime),
    endTime: normalizeString(drop.endTime),
    dropViewers: normalizeNumber(drop.dropViewers),
    dropPercent: normalizeNumber(drop.dropPercent),
    durationMinutes: normalizeNumber(drop.durationMinutes),
    maxRecovery: normalizeNumber(drop.maxRecovery),
    recoveryRatio: normalizeNumber(drop.recoveryRatio),
    recoveryTimeMinutes: normalizeNumber(drop.recoveryTimeMinutes),
    relatedMarkers: normalizeRelatedList(drop.relatedMarkers),
    relatedSegments: normalizeRelatedList(drop.relatedSegments),
    status: normalizeString(drop.status),
  }
}

function normalizeSegment(value) {
  if (typeof value === 'string') return { label: normalizeString(value) }
  const segment = asObject(value)
  if (!segment) return null
  return {
    startTime: normalizeString(segment.startTime ?? segment.start),
    endTime: normalizeString(segment.endTime ?? segment.end),
    label: normalizeString(segment.label ?? segment.name ?? segment.category),
    averageViewers: normalizeNumber(segment.averageViewers),
    text: normalizeLocalizedText(segment.text),
  }
}

function normalizeRetention(value) {
  const retention = asObject(value)
  if (!retention || Object.keys(retention).length === 0) return null
  return {
    startViewers: normalizeNumber(retention.startViewers),
    endViewers: normalizeNumber(retention.endViewers),
    averageViewers: normalizeNumber(retention.averageViewers),
    peakViewers: normalizeNumber(retention.peakViewers),
    endVsStartPercent: normalizeNumber(retention.endVsStartPercent),
    earlyBaselineViewers: normalizeNumber(retention.earlyBaselineViewers),
    changeFromEarlyBaselinePercent: normalizeNumber(retention.changeFromEarlyBaselinePercent),
    dropCount: normalizeInteger(retention.dropCount),
    recoveredDropCount: normalizeInteger(retention.recoveredDropCount),
    largestDrop: normalizeDrop(retention.largestDrop),
    stableSegment: normalizeSegment(retention.stableSegment),
    problemSegment: normalizeSegment(retention.problemSegment),
    curve: Array.isArray(retention.curve)
      ? retention.curve.map(normalizeCurvePoint).filter(Boolean)
      : [],
    drops: Array.isArray(retention.drops)
      ? retention.drops.map(normalizeDrop).filter(Boolean)
      : [],
  }
}

export function normalizeAdvancedAnalytics(payload) {
  const data = asObject(payload)
  if (!data) return null
  return {
    streamId: normalizeString(data.streamId),
    channelId: normalizeString(data.channelId) ?? normalizeNumber(data.channelId),
    source: normalizeString(data.source),
    generatedAt: normalizeString(data.generatedAt),
    dataQuality: normalizeDataQuality(data.dataQuality),
    loyalty: normalizeLoyalty(data.loyalty),
    clipSuggestions: Array.isArray(data.clipSuggestions)
      ? data.clipSuggestions.map(normalizeClipSuggestion).filter(Boolean)
      : [],
    eventImpact: Array.isArray(data.eventImpact)
      ? data.eventImpact.map(normalizeEventImpact).filter(Boolean)
      : [],
    retention: normalizeRetention(data.retention),
  }
}

export function buildAdvancedAnalyticsEndpoint({ streamId, dashboardMode, channelId }) {
  if (!streamId) return null
  const encodedStreamId = encodeURIComponent(streamId)
  if (dashboardMode === 'connected-channel' && channelId) {
    return `/api/channels/${encodeURIComponent(channelId)}/streams/${encodedStreamId}/advanced-analytics`
  }
  return `/api/streams/${encodedStreamId}/advanced-analytics`
}

export function createAdvancedAnalyticsFallback({ streamId, dashboardMode, requestError }) {
  const hasHttpStatus = requestError?.status !== null && requestError?.status !== undefined
  if (!requestError || hasHttpStatus || dashboardMode !== 'mock' || !streamId) return null
  return normalizeAdvancedAnalytics(createMockAdvancedAnalytics(streamId))
}

async function readResponse(response) {
  if (response.status === 204) return null
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(`Advanced analytics request failed with ${response.status}`)
    error.status = response.status
    error.code = normalizeString(payload?.error?.code ?? payload?.code)
    throw error
  }
  const normalized = normalizeAdvancedAnalytics(payload)
  if (!normalized) throw new Error('Advanced analytics response has an invalid shape')
  return normalized
}

export function useAdvancedAnalytics({
  streamId,
  dashboardMode = 'mock',
  channelId = null,
  enabled = true,
} = {}) {
  const [result, setResult] = useState({ requestKey: null, data: null, error: null })
  const [retryToken, setRetryToken] = useState(0)
  const endpoint = useMemo(
    () => buildAdvancedAnalyticsEndpoint({ streamId, dashboardMode, channelId }),
    [streamId, dashboardMode, channelId],
  )
  const requestKey = enabled && endpoint ? `${dashboardMode}::${endpoint}::${retryToken}` : null

  useEffect(() => {
    if (!requestKey || !endpoint) return undefined
    const controller = new AbortController()
    let active = true

    fetch(endpoint, { signal: controller.signal })
      .then(readResponse)
      .then((data) => {
        if (active) setResult({ requestKey, data, error: null })
      })
      .catch((requestError) => {
        if (active && requestError.name !== 'AbortError') {
          const fallback = createAdvancedAnalyticsFallback({
            streamId,
            dashboardMode,
            requestError,
          })
          setResult({
            requestKey,
            data: fallback,
            error: fallback ? null : requestError,
          })
        }
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [dashboardMode, endpoint, requestKey, streamId])

  const retry = useCallback(() => setRetryToken((current) => current + 1), [])

  if (!requestKey) {
    return { data: null, isLoading: false, error: null, retry }
  }
  if (result.requestKey !== requestKey) {
    return { data: null, isLoading: true, error: null, retry }
  }
  return {
    data: result.data,
    isLoading: false,
    error: result.error,
    retry,
  }
}
