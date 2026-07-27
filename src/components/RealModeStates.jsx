import { Reveal } from './MotionPrimitives.jsx'
import EmptyPanel from './EmptyPanel.jsx'
import { formatDashboardModeLabel } from '../utils/dashboardUi.js'
import { MetricCard, StatusBanner } from './UiPrimitives.jsx'

export function RealModeNotice({ title, note, variant = 'info' }) {
  return (
    <Reveal as="div" className="real-mode-notice">
      <StatusBanner variant={variant} title={title}>{note}</StatusBanner>
    </Reveal>
  )
}

export function RealDataEmptySection({ id, title, note, minHeight = 'medium' }) {
  return (
    <Reveal as="section" className="section-panel real-empty-section liquid-glass liquid-surface" id={id} aria-labelledby={`${id}-title`}>
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
  const totalMessages = chatAnalytics ? chatAnalytics.totalMessages ?? null : null
  const totalChatters = chatAnalytics ? chatAnalytics.activeNow ?? null : null
  const totalWords = wordAnalytics ? wordAnalytics.words?.length ?? null : null
  const totalVods = vodArchive ? vodArchive.comparison?.totalVods ?? vodArchive.vods?.length ?? null : null
  const cards = [
    { label: t.modePrefix, value: formatDashboardModeLabel(dashboardMode, channelLogin, t).replace(`${t.modePrefix}: `, '') },
    { label: t.connectedLabel, value: connected ? t.yes : t.no },
    { label: t.ingestRunningLabel, value: running ? t.yes : t.no },
    { label: t.streamStateLabel, value: metadata?.isLive === true ? t.streamLive : metadata?.isLive === false ? t.offlineNow : null },
    { label: t.collectedMessages, value: totalMessages === null ? null : totalMessages.toLocaleString() },
    { label: t.collectedChatters, value: totalChatters === null ? null : totalChatters.toLocaleString() },
    { label: t.collectedWords, value: totalWords === null ? null : totalWords.toLocaleString() },
    { label: t.vodCount, value: totalVods === null ? null : totalVods.toLocaleString() },
  ]

  return (
    <Reveal as="section" className="section-panel real-data-summary liquid-glass liquid-surface" id="summary" aria-labelledby="real-data-summary-title" data-liquid-interactive>
      <div className="section-heading">
        <div>
          <h2 id="real-data-summary-title">{t.realSummaryTitle}</h2>
        </div>
      </div>
      <div className="real-summary-grid">
        {cards.map((card) => (
          <MetricCard className="liquid-card glass-panel" label={card.label} value={card.value} emptyLabel={t.notAvailable} key={card.label} />
        ))}
      </div>
    </Reveal>
  )
}
