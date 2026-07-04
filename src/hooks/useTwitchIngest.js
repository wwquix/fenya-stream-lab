import { useCallback, useEffect, useState } from 'react'

const STATUS_POLL_INTERVAL_MS = 5_000

async function readPayload(response) {
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.message ?? `Twitch ingest request failed with ${response.status}`)
  }
  return payload
}

export function useTwitchIngest() {
  const [connection, setConnection] = useState(null)
  const [status, setStatus] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState(null)

  const loadConnection = useCallback(async (signal) => {
    const response = await fetch('/api/twitch/fenya/connection', { signal })
    const payload = await readPayload(response)
    setConnection(payload)
    return payload
  }, [])

  const loadStatus = useCallback(async (signal) => {
    const response = await fetch('/api/twitch/fenya/ingest/status', { signal })
    const payload = await readPayload(response)
    setStatus(payload)
    return payload
  }, [])

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
    setIsPending(true)
    setError(null)
    try {
      const response = await fetch(`/api/twitch/fenya/ingest/${action}`, { method: 'POST' })
      const payload = await readPayload(response)
      setStatus(payload)
      await loadConnection()
      return payload
    } catch (requestError) {
      setError(requestError)
      throw requestError
    } finally {
      setIsPending(false)
    }
  }, [loadConnection])

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
