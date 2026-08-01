import { useEffect, useState } from 'react'

const EMPTY_METADATA = {
  provider: null,
  channelLogin: null,
  displayName: null,
  profileImageUrl: null,
  broadcasterId: null,
  isLive: null,
  streamTitle: null,
  categoryName: null,
  viewerCount: null,
  thumbnailUrl: null,
  startedAt: null,
}

function normalizeString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function normalizeNumber(value) {
  return Number.isFinite(value) ? value : null
}

function normalizeMetadata(payload) {
  if (!payload || typeof payload !== 'object') {
    return EMPTY_METADATA
  }

  return {
    provider: normalizeString(payload.provider),
    channelLogin: normalizeString(payload.channelLogin),
    displayName: normalizeString(payload.displayName),
    profileImageUrl: normalizeString(payload.profileImageUrl),
    broadcasterId: normalizeString(payload.broadcasterId),
    isLive: typeof payload.isLive === 'boolean' ? payload.isLive : null,
    streamTitle: normalizeString(payload.streamTitle),
    categoryName: normalizeString(payload.categoryName),
    viewerCount: normalizeNumber(payload.viewerCount),
    thumbnailUrl: normalizeString(payload.thumbnailUrl),
    startedAt: normalizeString(payload.startedAt),
  }
}

export function useTwitchMetadata({ channelId = null } = {}) {
  const [metadata, setMetadata] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const endpoint = channelId ? `/api/channels/${encodeURIComponent(channelId)}/twitch` : '/api/twitch/fenya'

  useEffect(() => {
    const controller = new AbortController()
    let isActive = true
    let isRequestInFlight = false

    async function loadMetadata() {
      if (isRequestInFlight) return
      isRequestInFlight = true

      try {
        const response = await fetch(endpoint, {
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error(`Twitch metadata request failed with ${response.status}`)
        }

        const payload = await response.json()

        if (isActive) {
          setMetadata(normalizeMetadata(payload))
          setError(null)
        }
      } catch (requestError) {
        if (!isActive || requestError.name === 'AbortError') {
          return
        }

        setMetadata(null)
        setError(requestError)
      } finally {
        isRequestInFlight = false

        if (isActive && !controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    }

    loadMetadata()
    const pollingInterval = window.setInterval(loadMetadata, 10_000)

    return () => {
      isActive = false
      window.clearInterval(pollingInterval)
      controller.abort()
    }
  }, [endpoint])

  return {
    metadata,
    isLoading,
    error,
  }
}
