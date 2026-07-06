import { useCallback, useEffect, useState } from 'react'

const STATUS_POLL_INTERVAL_MS = 5_000
const ACTION_TIMEOUT_MS = 20_000

async function readPayload(response) {
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.message ?? `Twitch ingest request failed with ${response.status}`)
  }
  return payload
}

export function useTwitchIngest({ channelId = null } = {}) {
  const [connection, setConnection] = useState(null)
  const [status, setStatus] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState(null)

  const ingestBaseUrl = channelId
    ? `/api/channels/${encodeURIComponent(channelId)}/ingest`
    : '/api/twitch/fenya/ingest'

  const loadConnection = useCallback(async (signal) => {
    if (channelId) return null
    const response = await fetch('/api/twitch/fenya/connection', { signal })
    const payload = await readPayload(response)
    setConnection(payload)
    return payload
  }, [channelId])

  const loadStatus = useCallback(async (signal) => {
    const response = await fetch(`${ingestBaseUrl}/status`, { signal })
    const payload = await readPayload(response)
    setStatus(payload)
    return payload
  }, [ingestBaseUrl])

  useEffect(() => {
    const controller = new AbortController()
    let isActive = true

    async function loadInitialState() {
      try {
        await Promise.all([loadConnection(controller.signal), loadStatus(controller.signal)])
        if (isActive) setError(null)
      } catch (requestError) {
        if (isActive && requestError.name !== 'AbortError') setError(requestError)
      } finally {
        if (isActive) setIsLoading(false)
      }
    }

    async function refreshStatus() {
      try {
        await loadStatus(controller.signal)
        if (isActive) setError(null)
      } catch (requestError) {
        if (isActive && requestError.name !== 'AbortError') setError(requestError)
      }
    }

    loadInitialState()
    const pollingInterval = window.setInterval(refreshStatus, STATUS_POLL_INTERVAL_MS)
    return () => {
      isActive = false
      window.clearInterval(pollingInterval)
      controller.abort()
    }
  }, [loadConnection, loadStatus])

  const runAction = useCallback(async (action) => {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), ACTION_TIMEOUT_MS)
    setIsPending(true)
    setError(null)
    try {
      const response = await fetch(`${ingestBaseUrl}/${action}`, { method: 'POST', signal: controller.signal })
      const payload = await readPayload(response)
      setStatus(payload)
      await loadConnection()
      return payload
    } catch (requestError) {
      const safeError = requestError.name === 'AbortError'
        ? new Error('Twitch ingest request timed out. Check backend ingest status and try again.')
        : requestError
      setError(safeError)
      throw safeError
    } finally {
      window.clearTimeout(timeout)
      setIsPending(false)
    }
  }, [ingestBaseUrl, loadConnection])

  return {
    connection,
    status,
    isLoading,
    isPending,
    error,
    start: () => runAction('start'),
    stop: () => runAction('stop'),
  }
}
