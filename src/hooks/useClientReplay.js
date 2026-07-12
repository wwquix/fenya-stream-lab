import { useCallback, useEffect, useRef, useState } from 'react'
import { createReplayScheduler } from '../utils/sessionDashboard.js'

export function useClientReplay(samples, sessionId) {
  const scheduler = useRef(createReplayScheduler())
  const [speed, setSpeed] = useState(1)
  const [status, setStatus] = useState({ sessionId: null, isActive: false, progress: 0, currentTime: null })
  const [replaySamples, setReplaySamples] = useState([])
  const isCurrentReplay = status.sessionId === sessionId

  const stop = useCallback(() => {
    scheduler.current.stop()
    setStatus({ sessionId, isActive: false, progress: 0, currentTime: null })
    setReplaySamples([])
  }, [sessionId])

  const start = useCallback(() => {
    const started = scheduler.current.start(samples, speed, (sample, index, total) => {
      setReplaySamples(samples.slice(0, index + 1))
      setStatus({ sessionId, isActive: true, progress: Math.round(((index + 1) / total) * 100), currentTime: sample.timestamp ?? sample.time })
    }, () => {
      setReplaySamples([])
      setStatus({ sessionId, isActive: false, progress: 100, currentTime: samples.at(-1)?.timestamp ?? samples.at(-1)?.time ?? null })
    })
    return started
  }, [samples, sessionId, speed])

  useEffect(() => {
    const currentScheduler = scheduler.current
    return () => currentScheduler.stop()
  }, [sessionId])

  return {
    speed,
    setSpeed: (value) => setSpeed(Number(value)),
    status: isCurrentReplay ? status : { sessionId, isActive: false, progress: 0, currentTime: null },
    visibleSamples: isCurrentReplay && status.isActive ? replaySamples : samples,
    start,
    stop,
    canReplay: samples.length >= 2,
    isPending: false,
    error: null,
  }
}
