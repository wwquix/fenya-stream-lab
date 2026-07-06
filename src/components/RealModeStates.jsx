import { Reveal } from './MotionPrimitives.jsx'
import EmptyPanel from './EmptyPanel.jsx'
import { formatDashboardModeLabel } from '../utils/dashboardUi.js'

export function RealModeNotice({ title, note }) {
  return (
    <Reveal as="aside" className="real-mode-notice glass-panel" aria-label={title}>
      <span className="twitch-state-badge is-offline">Twitch</span>
      <div>
        <strong>{title}</strong>
        <p>{note}</p>
      </div>
    </Reveal>
  )
}

export function RealDataEmptySection({ id, title, note, minHeight = 'medium' }) {
  return (
    <Reveal as="section" className="section-panel real-empty-section" id={id} aria-labelledby={`${id}-title`}>
      <div className="section-heading">
        <div>
          <h2 id={`${id}-title`}>{title}</h2>
        </div>
      </div>
      <EmptyPanel message={note} minHeight={minHeight} />
    </Reveal>
  )
}

export function RealDataSummary({ connection, ingestStatus, metadata, chatAnalytics, wordAnalytics, vodArchive, dashboardMode, channelLogin, t }) {
  const connected = dashboardMode === 'connected-channel'
    ? !ingestStatus?.lastError
    : Boolean(connection?.appTokenAvailable && connection?.userTokenValid && !connection?.lastError)
  const running = ingestStatus?.status === 'running'
  const totalMessages = chatAnalytics?.totalMessages ?? 0
  const totalChatters = chatAnalytics?.activeNow ?? 0
  const totalWords = wordAnalytics?.words?.length ?? 0
  const totalVods = vodArchive?.comparison?.totalVods ?? vodArchive?.vods?.length ?? 0
  const cards = [
    { label: t.modePrefix, value: formatDashboardModeLabel(dashboardMode, channelLogin, t).replace(`${t.modePrefix}: `, '') },
    { label: t.connectedLabel, value: connected ? t.yes : t.no },
    { label: t.ingestRunningLabel, value: running ? t.yes : t.no },
    { label: t.streamStateLabel, value: metadata?.isLive ? t.streamLive : t.offlineNow },
    { label: t.collectedMessages, value: totalMessages.toLocaleString() },
    { label: t.collectedChatters, value: totalChatters.toLocaleString() },
    { label: t.collectedWords, value: totalWords.toLocaleString() },
    { label: t.vodCount, value: totalVods.toLocaleString() },
  ]

  return (
    <Reveal as="section" className="section-panel real-data-summary" id="summary" aria-labelledby="real-data-summary-title">
      <div className="section-heading">
        <div>
          <h2 id="real-data-summary-title">{t.realSummaryTitle}</h2>
        </div>
      </div>
      <div className="real-summary-grid">
        {cards.map((card) => (
          <article className="liquid-card glass-panel" key={card.label}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
          </article>
        ))}
      </div>
    </Reveal>
  )
}
