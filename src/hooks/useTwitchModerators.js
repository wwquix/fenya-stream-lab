import { useCallback, useEffect, useState } from 'react'

async function readPayload(response) {
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.message || `Moderator request failed with ${response.status}`)
  return payload
}

export function useTwitchModerators({ channelId = null, enabled = false } = {}) {
  const [data, setData] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [error, setError] = useState(null)
  const endpoint = channelId
    ? `/api/channels/${encodeURIComponent(channelId)}/moderators`
    : '/api/twitch/fenya/moderators'

  const load = useCallback(async () => {
    if (!enabled) return null
    setIsLoading(true)
    try {
      const payload = await readPayload(await fetch(endpoint))
      setData(payload)
      setError(null)
      return payload
    } catch (requestError) {
      setError(requestError)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [enabled, endpoint])

  useEffect(() => {
    const timer = window.setTimeout(load, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const sync = useCallback(async () => {
    setIsSyncing(true)
    setError(null)
    try {
      const payload = await readPayload(await fetch(`${endpoint}/sync`, { method: 'POST' }))
      setData(payload)
      return payload
    } catch (requestError) {
      setError(requestError)
      throw requestError
    } finally {
      setIsSyncing(false)
    }
  }, [endpoint])

  return { data, isLoading, isSyncing, error, sync, refresh: load }
}
