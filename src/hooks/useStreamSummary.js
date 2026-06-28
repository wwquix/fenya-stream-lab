import { useEffect, useState } from 'react'

function normalizeString(value, maximumLength) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maximumLength) : null
}

function normalizeInteger(value, minimum = 0) {
  return Number.isFinite(value) && value >= minimum ? Math.round(value) : null
}

function normalizeStreamSummary(payload) {
  if (!payload || typeof payload !== 'object' || !payload.metrics
    || !Array.isArray(payload.highlights) || !Array.isArray(payload.topWords)
    || !Array.isArray(payload.topChatters) || !Array.isArray(payload.insights)) {
    return null
  }

  const metrics = {
    durationMinutes: normalizeInteger(payload.metrics.durationMinutes, 1),
    averageViewers: normalizeInteger(payload.metrics.averageViewers),
    peakViewers: normalizeInteger(payload.metrics.peakViewers),
    totalMessages: normalizeInteger(payload.metrics.totalMessages),
    uniqueChatters: normalizeInteger(payload.metrics.uniqueChatters),
    moderationActions: normalizeInteger(payload.metrics.moderationActions),
    timeouts: normalizeInteger(payload.metrics.timeouts),
    bans: normalizeInteger(payload.metrics.bans),
  }
  const highlights = payload.highlights.map((item) => ({
    time: normalizeString(item?.time, 5),
    label: normalizeString(item?.label, 160),
    type: normalizeString(item?.type, 40),
    viewers: normalizeInteger(item?.viewers),
    messagesPerMinute: normalizeInteger(item?.messagesPerMinute),
  })).filter((item) => item.time && item.label)
  const topWords = payload.topWords.map((item) => ({
    text: normalizeString(item?.text, 48),
    count: normalizeInteger(item?.count, 1),
  })).filter((item) => item.text && item.count !== null).slice(0, 12)
  const topChatters = payload.topChatters.map((item) => ({
    nickname: normalizeString(item?.nickname, 32),
    messages: normalizeInteger(item?.messages),
    note: normalizeString(item?.note, 120),
  })).filter((item) => item.nickname && item.messages !== null).slice(0, 10)
  const insights = payload.insights.map((item) => normalizeString(item, 240)).filter(Boolean).slice(0, 10)
  const streamId = normalizeString(payload.streamId, 64)
  const title = normalizeString(payload.title, 160)
  const categoryName = normalizeString(payload.categoryName, 80)
  const verdict = normalizeString(payload.verdict, 180)

  if (!streamId || !title || !categoryName || !verdict
    || Object.values(metrics).some((value) => value === null) || topWords.length === 0
    || topChatters.length === 0 || insights.length === 0) {
    return null
  }

  return {
    streamId,
    title,
    categoryName,
    updatedAt: normalizeString(payload.updatedAt, 40),
    metrics,
    highlights,
    topWords,
    topChatters,
    insights,
    verdict,
  }
}

export function useStreamSummary() {
  const [summary, setSummary] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    let isActive = true

    async function loadSummary() {
      try {
        const response = await fetch('/api/summary/fenya/current-stream', { signal: controller.signal })

        if (!response.ok) {
          throw new Error(`Stream summary request failed with ${response.status}`)
        }

        const normalizedSummary = normalizeStreamSummary(await response.json())

        if (!normalizedSummary) {
          throw new Error('Stream summary response has an invalid shape')
        }

        if (isActive) {
          setSummary(normalizedSummary)
          setError(null)
        }
      } catch (requestError) {
        if (!isActive || requestError.name === 'AbortError') {
          return
        }

        setError(requestError)
      } finally {
        if (isActive && !controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    }

    loadSummary()

    return () => {
      isActive = false
      controller.abort()
    }
  }, [])

  return { summary, isLoading, error }
}
