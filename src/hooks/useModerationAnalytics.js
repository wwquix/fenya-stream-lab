import { useEffect, useState } from 'react'

const MODERATION_POLL_INTERVAL_MS = 15_000

function normalizeString(value, maximumLength = 160) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maximumLength) : null
}

function normalizeNumber(value, minimum, maximum) {
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : null
}

function normalizeInteger(value) {
  const number = normalizeNumber(value, 0, Number.MAX_SAFE_INTEGER)
  return number === null ? null : Math.round(number)
}

function normalizeModerator(moderator) {
  const nickname = normalizeString(moderator?.nickname, 32)
  const actions = normalizeInteger(moderator?.actions)
  const timeouts = normalizeInteger(moderator?.timeouts)
  const bans = normalizeInteger(moderator?.bans)
  const deletedMessages = normalizeInteger(moderator?.deletedMessages)
  const responseTimeSec = normalizeNumber(moderator?.responseTimeSec, 1, 120)
  const accuracy = normalizeNumber(moderator?.accuracy, 0, 100)

  if (!nickname || [actions, timeouts, bans, deletedMessages, responseTimeSec, accuracy].some((value) => value === null)) {
    return null
  }

  return {
    nickname,
    actions,
    timeouts,
    bans,
    deletedMessages,
    responseTimeSec,
    accuracy,
    status: normalizeString(moderator.status, 24) ?? 'active',
  }
}

function normalizeTimelinePoint(point) {
  const time = normalizeString(point?.time, 5)
  const actions = normalizeInteger(point?.actions)
  const timeouts = normalizeInteger(point?.timeouts)
  const bans = normalizeInteger(point?.bans)
  const deletedMessages = normalizeInteger(point?.deletedMessages)

  return /^\d{2}:\d{2}$/.test(time ?? '')
    && [actions, timeouts, bans, deletedMessages].every((value) => value !== null)
    ? { time, actions, timeouts, bans, deletedMessages }
    : null
}

function normalizeEvent(event) {
  const time = normalizeString(event?.time, 5)
  const label = normalizeString(event?.label, 120)
  const actions = normalizeInteger(event?.actions)

  if (!/^\d{2}:\d{2}$/.test(time ?? '') || !label || actions === null) {
    return null
  }

  return {
    time,
    label,
    actions,
    type: normalizeString(event.type, 40) ?? 'moderation-action',
    note: normalizeString(event.note, 180),
  }
}

function normalizeSummary(summary) {
  const totalActions = normalizeInteger(summary?.totalActions)
  const timeouts = normalizeInteger(summary?.timeouts)
  const bans = normalizeInteger(summary?.bans)
  const deletedMessages = normalizeInteger(summary?.deletedMessages)
  const averageResponseTimeSec = normalizeNumber(summary?.averageResponseTimeSec, 1, 120)
  const peakModerationMinute = normalizeString(summary?.peakModerationMinute, 5)

  return [totalActions, timeouts, bans, deletedMessages, averageResponseTimeSec].every((value) => value !== null)
    && /^\d{2}:\d{2}$/.test(peakModerationMinute ?? '')
    ? { totalActions, timeouts, bans, deletedMessages, averageResponseTimeSec, peakModerationMinute }
    : null
}

function normalizeModerationAnalytics(payload) {
  if (!payload || typeof payload !== 'object'
    || !Array.isArray(payload.moderators)
    || !Array.isArray(payload.timeline)
    || !Array.isArray(payload.events)) {
    return null
  }

  const summary = normalizeSummary(payload.summary)
  const moderators = payload.moderators.map(normalizeModerator).filter(Boolean).slice(0, 12)

  if (!summary || moderators.length === 0) {
    return null
  }

  return {
    streamId: normalizeString(payload.streamId, 64),
    title: normalizeString(payload.title),
    updatedAt: normalizeString(payload.updatedAt),
    summary,
    moderators,
    timeline: payload.timeline
      .map(normalizeTimelinePoint)
      .filter(Boolean)
      .sort((first, second) => first.time.localeCompare(second.time)),
    events: payload.events.map(normalizeEvent).filter(Boolean).slice(-25),
  }
}

export function useModerationAnalytics() {
  const [analytics, setAnalytics] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    let isActive = true
    let isInitialRequest = true
    let isRequestInFlight = false

    async function loadAnalytics() {
      if (isRequestInFlight) {
        return
      }

      isRequestInFlight = true

      try {
        const response = await fetch('/api/moderation/fenya/current-stream', { signal: controller.signal })

        if (!response.ok) {
          throw new Error(`Moderation analytics request failed with ${response.status}`)
        }

        const normalizedAnalytics = normalizeModerationAnalytics(await response.json())

        if (!normalizedAnalytics) {
          throw new Error('Moderation analytics response has an invalid shape')
        }

        if (isActive) {
          setAnalytics(normalizedAnalytics)
          setError(null)
        }
      } catch (requestError) {
        if (!isActive || requestError.name === 'AbortError') {
          return
        }

        setError(requestError)
      } finally {
        isRequestInFlight = false

        if (isActive && isInitialRequest && !controller.signal.aborted) {
          isInitialRequest = false
          setIsLoading(false)
        }
      }
    }

    loadAnalytics()
    const pollingInterval = window.setInterval(loadAnalytics, MODERATION_POLL_INTERVAL_MS)

    return () => {
      isActive = false
      window.clearInterval(pollingInterval)
      controller.abort()
    }
  }, [])

  return { analytics, isLoading, error }
}
