import { useEffect, useState } from 'react'

function normalizeString(value, maximumLength = 240) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maximumLength) : null
}

function normalizeInteger(value, minimum = 0) {
  return Number.isFinite(value) && value >= minimum ? Math.round(value) : null
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) {
    return false
  }

  const parsedDate = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === value
}

function normalizeArchivedStream(stream) {
  const streamId = normalizeString(stream?.streamId, 80)
  const date = normalizeString(stream?.date, 10)
  const title = normalizeString(stream?.title, 160)
  const categoryName = normalizeString(stream?.categoryName, 80)
  const durationMinutes = normalizeInteger(stream?.durationMinutes, 1)
  const averageViewers = normalizeInteger(stream?.averageViewers)
  const peakViewers = normalizeInteger(stream?.peakViewers)
  const totalMessages = normalizeInteger(stream?.totalMessages)
  const uniqueChatters = normalizeInteger(stream?.uniqueChatters)
  const moderationActions = normalizeInteger(stream?.moderationActions)
  const topWords = Array.isArray(stream?.topWords)
    ? stream.topWords.map((word) => normalizeString(word, 32)).filter(Boolean).slice(0, 5)
    : []

  if (!streamId || !isValidDate(date) || !title || !categoryName || topWords.length === 0
    || [durationMinutes, averageViewers, peakViewers, totalMessages, uniqueChatters, moderationActions].some((value) => value === null)) {
    return null
  }

  return {
    streamId,
    date,
    title,
    categoryName,
    startedAt: normalizeString(stream.startedAt, 40),
    endedAt: normalizeString(stream.endedAt, 40),
    durationMinutes,
    averageViewers,
    peakViewers,
    totalMessages,
    uniqueChatters,
    moderationActions,
    topWords,
    topMoment: normalizeString(stream.topMoment, 180),
    summary: normalizeString(stream.summary),
    status: normalizeString(stream.status, 24) ?? 'completed',
  }
}

function normalizeArchive(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.streams)) {
    return null
  }

  const streams = payload.streams
    .map(normalizeArchivedStream)
    .filter(Boolean)
    .sort((first, second) => second.date.localeCompare(first.date))
    .slice(0, 50)

  if (streams.length === 0) {
    return null
  }

  return {
    channelLogin: normalizeString(payload.channelLogin, 32),
    updatedAt: normalizeString(payload.updatedAt, 40),
    streams,
  }
}

export function useStreamArchive() {
  const [archive, setArchive] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    let isActive = true

    async function loadArchive() {
      try {
        const response = await fetch('/api/archive/fenya/streams', { signal: controller.signal })

        if (!response.ok) {
          throw new Error(`Stream archive request failed with ${response.status}`)
        }

        const normalizedArchive = normalizeArchive(await response.json())

        if (!normalizedArchive) {
          throw new Error('Stream archive response has an invalid shape')
        }

        if (isActive) {
          setArchive(normalizedArchive)
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

    loadArchive()

    return () => {
      isActive = false
      controller.abort()
    }
  }, [])

  return { archive, isLoading, error }
}
