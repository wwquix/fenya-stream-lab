import { useEffect, useState } from 'react'

const CHAT_ANALYTICS_POLL_INTERVAL_MS = 10_000
const leaderboardIds = ['messages', 'watchTime', 'tempo', 'engagement']

function normalizeString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function normalizeLeaderboard(entries, leaderboardId) {
  if (!Array.isArray(entries)) {
    return null
  }

  const normalizedEntries = entries.map((entry) => {
    const nickname = normalizeString(entry?.nickname)
    const note = normalizeString(entry?.note)
    const value = leaderboardId === 'messages'
      ? Number.isFinite(entry?.value) && entry.value >= 0 ? entry.value : null
      : normalizeString(entry?.value)

    return nickname && value !== null
      ? { nickname, value, note }
      : null
  }).filter(Boolean)

  return normalizedEntries.length ? normalizedEntries : null
}

function normalizeChatAnalytics(payload) {
  if (!payload || typeof payload !== 'object' || !payload.leaderboards) {
    return null
  }

  const leaderboards = {}

  for (const leaderboardId of leaderboardIds) {
    const entries = normalizeLeaderboard(payload.leaderboards[leaderboardId], leaderboardId)

    if (!entries) {
      return null
    }

    leaderboards[leaderboardId] = entries
  }

  if (!Number.isFinite(payload.activeNow)
    || !Number.isFinite(payload.totalMessages)
    || !Number.isFinite(payload.activityPeak)) {
    return null
  }

  return {
    streamId: normalizeString(payload.streamId),
    title: normalizeString(payload.title),
    activeNow: Math.max(0, payload.activeNow),
    totalMessages: Math.max(0, payload.totalMessages),
    activityPeak: Math.min(10, Math.max(1, payload.activityPeak)),
    leaderboards,
    recentMessages: Array.isArray(payload.recentMessages) ? payload.recentMessages : [],
    updatedAt: normalizeString(payload.updatedAt),
  }
}

export function useChatAnalytics() {
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
        const response = await fetch('/api/chat/fenya/current-stream', {
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error(`Chat analytics request failed with ${response.status}`)
        }

        const normalizedAnalytics = normalizeChatAnalytics(await response.json())

        if (!normalizedAnalytics) {
          throw new Error('Chat analytics response has an invalid shape')
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
    const pollingInterval = window.setInterval(loadAnalytics, CHAT_ANALYTICS_POLL_INTERVAL_MS)

    return () => {
      isActive = false
      window.clearInterval(pollingInterval)
      controller.abort()
    }
  }, [])

  return {
    analytics,
    isLoading,
    error,
  }
}
