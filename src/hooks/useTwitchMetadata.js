import { useEffect, useState } from 'react'

const EMPTY_METADATA = {
  displayName: null,
  profileImageUrl: null,
  broadcasterId: null,
  isLive: null,
  streamTitle: null,
  categoryName: null,
  viewerCount: null,
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
    displayName: normalizeString(payload.displayName),
    profileImageUrl: normalizeString(payload.profileImageUrl),
    broadcasterId: normalizeString(payload.broadcasterId),
    isLive: typeof payload.isLive === 'boolean' ? payload.isLive : null,
    streamTitle: normalizeString(payload.streamTitle),
    categoryName: normalizeString(payload.categoryName),
    viewerCount: normalizeNumber(payload.viewerCount),
    startedAt: normalizeString(payload.startedAt),
  }
}

export function useTwitchMetadata() {
  const [metadata, setMetadata] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    let isActive = true

    async function loadMetadata() {
      try {
        const response = await fetch('/api/twitch/fenya', {
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
        if (isActive && !controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    }

    loadMetadata()

    return () => {
      isActive = false
      controller.abort()
    }
  }, [])

  return {
    metadata,
    isLoading,
    error,
  }
}
