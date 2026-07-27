import { MotionCard } from './MotionPrimitives.jsx'
import { StatusBanner } from './UiPrimitives.jsx'

function show(value, fallback) {
  return value === null || value === undefined || value === '' ? fallback : value
}

function formatDuration(minutes, t) {
  if (!Number.isFinite(minutes)) return t.notAvailable
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return hours ? `${hours}${t.hoursShort} ${rest}${t.minutesShort}` : `${rest}${t.minutesShort}`
}

function SessionInsights({ session, ingestStatus, error = null, t }) {
  if (error && !session) {
    return (
      <MotionCard as="article" className="session-insights glass-panel liquid-card subtle-shine" aria-label={t.sessionInsights}>
        <h3>{t.sessionInsights}</h3>
        <StatusBanner className="session-insights-empty" variant="error">{t.sessionInsightsError}</StatusBanner>
      </MotionCard>
    )
  }
  if (!session) {
    return (
      <MotionCard as="article" className="session-insights glass-panel liquid-card subtle-shine" aria-label={t.sessionInsights}>
        <h3>{t.sessionInsights}</h3>
        <p className="session-insights-empty">{t.sessionInsightsEmpty}</p>
      </MotionCard>
    )
  }
  const latestSample = session.samples?.at(-1)
  const latestEvent = session.events?.at(-1)
  const collectionStatus = ingestStatus?.status === 'running' ? t.collectionActive : session.status === 'live' ? t.collectionWaiting : t.collectionCompleted
  return (
    <MotionCard as="article" className="session-insights glass-panel liquid-card subtle-shine" aria-label={t.sessionInsights}>
      <div className="chat-leaderboard-header"><h3>{t.sessionInsights}</h3><span className={`session-status is-${session.status ?? 'completed'}`}>{collectionStatus}</span></div>
      <p className="session-insights-title">{session.title}</p>
      {error ? <StatusBanner className="session-insights-warning" variant="warning">{t.sessionPartialData}</StatusBanner> : null}
      <dl className="session-insights-grid">
        <div><dt>{t.category}</dt><dd>{show(session.category, t.notAvailable)}</dd></div>
        <div><dt>{t.duration}</dt><dd>{formatDuration(session.durationMinutes, t)}</dd></div>
        <div><dt>{t.averageViewers}</dt><dd>{show(session.averageViewers, t.notAvailable)}</dd></div>
        <div><dt>{t.peakViewers}</dt><dd>{show(session.peakViewers, t.notAvailable)}</dd></div>
        <div><dt>{t.streamMessages}</dt><dd>{show(session.totalMessages, t.notAvailable)}</dd></div>
      </dl>
      <details className="methodology-details session-insights-details">
        <summary>{t.sessionSecondaryDetails}</summary>
        <dl className="session-insights-grid is-secondary">
          <div><dt>{t.latestMessagesPerMinute}</dt><dd>{show(latestSample?.messagesPerMinute, t.notAvailable)}</dd></div>
          <div><dt>{t.latestActivitySpike}</dt><dd>{show(latestEvent?.label, t.notAvailable)}</dd></div>
          <div><dt>{t.latestChatEvent}</dt><dd>{show(ingestStatus?.lastEventAt ?? latestEvent?.time, t.notAvailable)}</dd></div>
          <div><dt>{t.dataCollectionStatus}</dt><dd>{collectionStatus}</dd></div>
        </dl>
      </details>
    </MotionCard>
  )
}

export default SessionInsights
