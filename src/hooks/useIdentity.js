import { useCallback, useEffect, useState } from 'react'

export function useIdentity() {
  const [identity, setIdentity] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/me')
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.message || 'Identity request failed')
      setIdentity(payload)
      setError(null)
      return payload
    } catch (requestError) {
      setError(requestError)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(refresh, 0)
    return () => window.clearTimeout(timer)
  }, [refresh])

  return { identity, isLoading, error, refresh }
}
