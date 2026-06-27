import { useEffect, useState } from 'react'

function normalizeString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function normalizeNumber(value) {
  return Number.isFinite(value) ? value : null
}

function isValidTime(value) {
  return /^\d{2}:\d{2}$/.test(value)
}

function minutesFromTime(time) {
  const [hours, minutes] = time.split(':').map(Number)
  return (hours < 6 ? hours + 24 : hours) * 60 + minutes
}

function getSegmentCategory(label) {
  if (label === 'Общение') {
    return 'Just Chatting'
  }

  if (label === 'Counter-Strike 2') {
    return 'CS2'
  }

  return label || 'Live stream'
}

function getCategoryForTime(time, segments) {
  const pointMinutes = minutesFromTime(time)
  const segment = segments.find((item) => {
    const startMinutes = minutesFromTime(item.start)
    const endMinutes = minutesFromTime(item.end)
    return pointMinutes >= startMinutes && pointMinutes <= endMinutes
  })

  return segment?.category ?? 'Live stream'
}

function normalizeAnalytics(payload) {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const points = Array.isArray(payload.points)
    ? payload.points
        .map((point) => ({
          time: normalizeString(point?.time),
          viewers: normalizeNumber(point?.viewers),
          messagesPerMinute: normalizeNumber(point?.messagesPerMinute),
        }))
        .filter((point) => point.time && isValidTime(point.time) && point.viewers !== null && point.messagesPerMinute !== null)
    : []

  const segments = Array.isArray(payload.segments)
    ? payload.segments
        .map((segment) => ({
          start: normalizeString(segment?.start),
          end: normalizeString(segment?.end),
          label: normalizeString(segment?.label),
        }))
        .filter((segment) => segment.start && segment.end && isValidTime(segment.start) && isValidTime(segment.end))
    : []

  const events = Array.isArray(payload.events)
    ? payload.events
        .map((event) => ({
          time: normalizeString(event?.time),
          label: normalizeString(event?.label),
          category: normalizeString(event?.category),
          type: normalizeString(event?.type),
          viewers: normalizeNumber(event?.viewers),
          messagesPerMinute: normalizeNumber(event?.messagesPerMinute),
        }))
        .filter((event) => event.time && event.label && isValidTime(event.time))
    : []

  if (points.length < 2 || segments.length === 0) {
    return null
  }

  return {
    streamId: normalizeString(payload.streamId),
    title: normalizeString(payload.title),
    categoryName: normalizeString(payload.categoryName),
    startedAt: normalizeString(payload.startedAt),
    points,
    segments,
    events,
  }
}

export function adaptAnalyticsForStreamPulse(analytics, fallbackStream) {
  if (!analytics) {
    return null
  }

  const streamId = fallbackStream.id
  const categorySegments = analytics.segments.map((segment, index) => ({
    id: `backend-segment-${index + 1}`,
    start: segment.start,
    end: segment.end,
    category: getSegmentCategory(segment.label),
  }))

  const chartData = analytics.points.map((point) => ({
    time: point.time,
    viewers: point.viewers,
    chatMessagesPerMinute: point.messagesPerMinute,
    category: getCategoryForTime(point.time, categorySegments),
    previewLabel: analytics.events.find((event) => event.time === point.time)?.label ?? analytics.title ?? fallbackStream.title,
  }))

  const events = analytics.events.map((event, index) => ({
    id: `backend-event-${index + 1}`,
    streamId,
    type: event.type ?? 'activity-spike',
    label: event.label,
    time: event.time,
    entityType: 'stream',
    entityId: streamId,
  }))

  return {
    stream: {
      ...fallbackStream,
      title: analytics.title ?? fallbackStream.title,
      category: analytics.categoryName ?? fallbackStream.category,
      categorySegments,
      chartData,
    },
    events,
  }
}

export function useStreamAnalytics() {
  const [analytics, setAnalytics] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const controller = new AbortController()

    async function loadAnalytics() {
      try {
        setIsLoading(true)
        setError(null)

        const response = await fetch('/api/analytics/fenya/current-stream', {
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error(`Stream analytics request failed with ${response.status}`)
        }

        const payload = await response.json()
        setAnalytics(normalizeAnalytics(payload))
      } catch (requestError) {
        if (requestError.name === 'AbortError') {
          return
        }

        setAnalytics(null)
        setError(requestError)
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    }

    loadAnalytics()

    return () => {
      controller.abort()
    }
  }, [])

  return {
    analytics,
    isLoading,
    error,
  }
}
