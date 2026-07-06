import { useCallback, useEffect, useState } from 'react'

export function normalizeVodPayload(payload) {
  if (Array.isArray(payload)) return payload.slice(0, 50)
  if (Array.isArray(payload?.vods)) return payload.vods.slice(0, 50)
  if (Array.isArray(payload?.data)) return payload.data.slice(0, 50)
  if (Array.isArray(payload?.data?.vods)) return payload.data.vods.slice(0, 50)
  return []
}

async function readPayload(response) {
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.message || `Twitch VOD request failed with ${response.status}`)
  return payload
}

export function useTwitchVods({ channelId = null, enabled = false } = {}) {
  const [vods, setVods] = useState([])
  const [comparison, setComparison] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [error, setError] = useState(null)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [syncedCount, setSyncedCount] = useState(null)
  const base = channelId ? `/api/channels/${encodeURIComponent(channelId)}/archive` : '/api/twitch/fenya/archive'

  const load = useCallback(async () => {
    if (!enabled) return
    setIsLoading(true)
    setError(null)
    try {
      const vodPayload = await readPayload(await fetch(`${base}/vods`))
      setVods(normalizeVodPayload(vodPayload))
      setHasLoaded(true)

      try {
        const comparisonPayload = await readPayload(await fetch(`${base}/vods/comparison`))
        setComparison(comparisonPayload)
      } catch (comparisonError) {
        setComparison(null)
        setError(comparisonError)
      }
    } catch (requestError) {
      setError(requestError)
      setHasLoaded(true)
    } finally {
      setIsLoading(false)
    }
  }, [base, enabled])

  useEffect(() => {
    const timer = window.setTimeout(load, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const sync = useCallback(async () => {
    setIsSyncing(true)
    setError(null)
    try {
      const response = await fetch(`${base}/sync-vods`, { method: 'POST' })
      const payload = await readPayload(response)
      const syncedVods = normalizeVodPayload(payload)
      const resultCount = Number.isFinite(Number(payload.syncedCount)) ? Number(payload.syncedCount) : syncedVods.length
      setSyncedCount(resultCount)
      if (syncedVods.length) {
        setVods(syncedVods)
        setHasLoaded(true)
      }
      await load()
      return payload
    } catch (requestError) {
      setError(requestError)
      throw requestError
    } finally {
      setIsSyncing(false)
    }
  }, [base, load])

  return { vods, comparison, isLoading, isSyncing, error, hasLoaded, syncedCount, sync, refresh: load }
}
