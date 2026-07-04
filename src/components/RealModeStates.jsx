import { Reveal } from './MotionPrimitives.jsx'

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

export function RealDataEmptySection({ id, title, note }) {
  return (
    <Reveal as="section" className="section-panel real-empty-section" id={id} aria-labelledby={`${id}-title`}>
      <div className="section-heading">
        <div>
          <h2 id={`${id}-title`}>{title}</h2>
        </div>
      </div>
      <div className="real-data-empty compact glass-panel" role="status">
        <p>{note}</p>
      </div>
    </Reveal>
  )
}

export function RealDataSummary({ connection, ingestStatus, metadata, chatAnalytics, wordAnalytics, t }) {
  const connected = Boolean(connection?.appTokenAvailable && connection?.userTokenValid && !connection?.lastError)
  const running = ingestStatus?.status === 'running'
  const totalMessages = chatAnalytics?.totalMessages ?? 0
  const totalChatters = chatAnalytics?.activeNow ?? 0
  const totalWords = wordAnalytics?.words?.length ?? 0
  const cards = [
    { label: t.connectedLabel, value: connected ? t.yes : t.no },
    { label: t.ingestRunningLabel, value: running ? t.yes : t.no },
    { label: t.streamStateLabel, value: metadata?.isLive ? t.streamLive : t.offlineNow },
    { label: t.collectedMessages, value: totalMessages.toLocaleString() },
    { label: t.collectedChatters, value: totalChatters.toLocaleString() },
    { label: t.collectedWords, value: totalWords.toLocaleString() },
  ]

  return (
    <Reveal as="section" className="section-panel real-data-summary" id="summary" aria-labelledby="real-data-summary-title">
      <div className="section-heading">
        <div>
          <h2 id="real-data-summary-title">{t.realSummaryTitle}</h2>
          <p className="section-note">{t.realSummaryNote}</p>
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
