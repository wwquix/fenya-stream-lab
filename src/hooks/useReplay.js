import { useEffect, useMemo, useState } from 'react'

const initialStatus = { status: 'idle', isActive: false, speed: null, progress: 0 }

export function useReplay(streamId) {
  const [status, setStatus] = useState(initialStatus)
  const [speed, setSpeed] = useState(5)
  const [events, setEvents] = useState([])
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const source = new EventSource(`/api/replay/${encodeURIComponent(streamId)}/events`)
    const eventTypes = ['replay_started', 'chat_message', 'viewer_sample', 'moderation_action', 'stream_marker', 'replay_finished', 'replay_error']

    function handleEvent(event) {
      const payload = JSON.parse(event.data)
      if (event.type === 'replay_started' || event.type === 'replay_finished' || event.type === 'replay_error') {
        setStatus(payload)
        if (event.type === 'replay_started' && payload.cursor === 0) setEvents([])
        if (event.type === 'replay_finished' && payload.status === 'idle') setEvents([])
        if (event.type === 'replay_error') setError(new Error(payload.message ?? 'Replay failed'))
        return
      }
      setEvents((current) => [...current, { type: event.type, ...payload }])
      setStatus((current) => ({ ...current, cursor: payload.sequence, progress: current.eventCount ? Math.round((payload.sequence / current.eventCount) * 100) : current.progress }))
    }

    eventTypes.forEach((type) => source.addEventListener(type, handleEvent))
    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED) setError(new Error('Replay connection closed'))
    }

    fetch(`/api/replay/${encodeURIComponent(streamId)}/status`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`Replay status failed with ${response.status}`)))
      .then((payload) => {
        setStatus(payload)
        setEvents([])
        setError(null)
      })
      .catch(setError)

    return () => source.close()
  }, [streamId])

  async function request(path, options) {
    setIsPending(true)
    setError(null)
    try {
      const response = await fetch(`/api/replay/${encodeURIComponent(streamId)}/${path}`, options)
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.message ?? `Replay request failed with ${response.status}`)
      setStatus(payload)
      return payload
    } catch (requestError) {
      setError(requestError)
      throw requestError
    } finally {
      setIsPending(false)
    }
  }

  const data = useMemo(() => ({
    viewerSamples: events.filter((event) => event.type === 'viewer_sample'),
    chatMessages: events.filter((event) => event.type === 'chat_message'),
    moderationActions: events.filter((event) => event.type === 'moderation_action'),
    markers: events.filter((event) => event.type === 'stream_marker'),
  }), [events])

  return {
    status,
    speed,
    setSpeed,
    data,
    isPending,
    error,
    start: () => request('start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ speed }) }),
    stop: () => request('stop', { method: 'POST' }),
  }
}
