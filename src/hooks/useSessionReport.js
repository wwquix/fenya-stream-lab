import { useEffect, useState } from 'react'

export function useSessionReport(streamId, enabled = true) {
  const [result, setResult] = useState({ streamId: null, report: null, error: null })

  useEffect(() => {
    if (!enabled || !streamId) return undefined
    const controller = new AbortController()
    let active = true
    fetch(`/api/streams/${encodeURIComponent(streamId)}/report/json`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`Session data request failed with ${response.status}`)))
      .then((payload) => { if (active) setResult({ streamId, report: payload, error: null }) })
      .catch((requestError) => {
        if (active && requestError.name !== 'AbortError') setResult({ streamId, report: null, error: requestError })
      })
    return () => {
      active = false
      controller.abort()
    }
  }, [enabled, streamId])

  if (!enabled || !streamId) return { report: null, isLoading: false, error: null }
  return result.streamId === streamId
    ? { report: result.report, isLoading: false, error: result.error }
    : { report: null, isLoading: true, error: null }
}
