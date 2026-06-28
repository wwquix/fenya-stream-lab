import { useEffect, useState } from 'react'

const WORD_ANALYTICS_POLL_INTERVAL_MS = 15_000
const validTones = new Set(['neutral', 'hype', 'toxic', 'funny'])
const validCategories = new Set(['gameplay', 'chat', 'reaction', 'meme', 'moderation'])
const minimumWeight = 8
const maximumWeight = 100

function normalizeString(value, maximumLength = 120) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maximumLength) : null
}

function normalizeWord(word) {
  const text = normalizeString(word?.text, 48)
  const count = Number.isFinite(word?.count) && word.count > 0 ? Math.round(word.count) : null

  if (!text || count === null) {
    return null
  }

  return {
    text,
    count,
    tone: validTones.has(word.tone) ? word.tone : 'neutral',
    category: validCategories.has(word.category) ? word.category : 'chat',
  }
}

function normalizeWordWeights(words) {
  const counts = words.map((word) => word.count)
  const minimumCount = Math.min(...counts)
  const maximumCount = Math.max(...counts)
  const countRange = maximumCount - minimumCount
  const uniqueCounts = [...new Set(counts)].sort((first, second) => first - second)
  const weightByCount = new Map()
  let previousWeight = minimumWeight - 1

  uniqueCounts.forEach((count, index) => {
    const normalizedCount = countRange === 0 ? 1 : (count - minimumCount) / countRange
    const smoothWeight = Math.round(minimumWeight + Math.sqrt(normalizedCount) * (maximumWeight - minimumWeight))
    const maximumAllowedWeight = maximumWeight - (uniqueCounts.length - index - 1)
    const weight = Math.min(maximumAllowedWeight, Math.max(previousWeight + 1, smoothWeight))
    weightByCount.set(count, weight)
    previousWeight = weight
  })

  return words.map((word) => ({ ...word, weight: weightByCount.get(word.count) }))
}

function normalizeWordAnalytics(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.words)) {
    return null
  }

  const validWords = payload.words
    .map(normalizeWord)
    .filter(Boolean)
    .sort((first, second) => second.count - first.count)
    .slice(0, 50)

  if (validWords.length === 0) {
    return null
  }

  return {
    streamId: normalizeString(payload.streamId),
    title: normalizeString(payload.title),
    source: normalizeString(payload.source, 24),
    updatedAt: normalizeString(payload.updatedAt),
    words: normalizeWordWeights(validWords),
    clusters: Array.isArray(payload.clusters) ? payload.clusters : [],
  }
}

export function useWordAnalytics() {
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
        const response = await fetch('/api/words/fenya/current-stream', { signal: controller.signal })

        if (!response.ok) {
          throw new Error(`Word analytics request failed with ${response.status}`)
        }

        const normalizedAnalytics = normalizeWordAnalytics(await response.json())

        if (!normalizedAnalytics) {
          throw new Error('Word analytics response has an invalid shape')
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
    const pollingInterval = window.setInterval(loadAnalytics, WORD_ANALYTICS_POLL_INTERVAL_MS)

    return () => {
      isActive = false
      window.clearInterval(pollingInterval)
      controller.abort()
    }
  }, [])

  return { analytics, isLoading, error }
}
