import CustomSelect from './CustomSelect.jsx'
import { ProgressActionButton, Reveal } from './MotionPrimitives.jsx'
import { formatCategory, formatStreamTitle } from '../i18n/translations.js'
import { hasCollectionGap } from '../utils/dashboardUi.js'
import { createSessionCsv, createSessionReportHtml, sessionExportFilename } from '../utils/sessionDashboard.js'
import { MetricCard, StatusBanner } from './UiPrimitives.jsx'

function createCsv(stream) {
  const rows = [
    ['time', 'viewers', 'chatMessagesPerMinute', 'category', 'previewLabel'],
    ...stream.chartData.map((point) => [point.time, point.viewers, point.chatMessagesPerMinute, point.category, point.previewLabel ?? '']),
  ]

  return rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n')
}

function downloadCsv(stream) {
  const blob = new Blob([createCsv(stream)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${stream.id}-pulse.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function downloadText(content, type, filename) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function formatStatusTime(value, isRussian) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat(isRussian ? 'ru-RU' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date)
}

function formatCollectionTime(value, isRussian) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat(isRussian ? 'ru-RU' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date)
}

function StreamControlBar({ streams, internalSessions = [], selectedSession = null, selectedStreamId, compareStreamId, onStreamChange, onCompareChange, twitchMetadata, twitchIngest, persistedMessageCount = null, isTwitchMode, dashboardMode = 'mock', canManageChannel = false, readOnlyAccess = false, isDataModeLoading, sessionDataLoading = false, replay, streamSummary, t }) {
  const selectedStream = streams.find((stream) => stream.id === selectedStreamId) ?? streams[0]
  const metadata = twitchMetadata?.metadata
  const streamOptions = streams.map((stream) => ({ value: stream.id, label: formatStreamTitle(stream, t) }))
  const preparingLabel = t.exportReport === 'Отчёт' ? 'Готовим...' : 'Preparing...'
  const compareOptions = [
    { value: '', label: t.compareOff },
    ...streams.filter((stream) => stream.id !== selectedStreamId).map((stream) => ({ value: stream.id, label: formatStreamTitle(stream, t) })),
  ]
  const metadataTitle = metadata?.streamTitle || formatStreamTitle(selectedStream, t)
  const metadataCategory = metadata?.categoryName || formatCategory(selectedStream.summary?.bestCategory || selectedStream.category, t)
  const hasLiveState = typeof metadata?.isLive === 'boolean'
  const liveLabel = hasLiveState ? (metadata.isLive ? t.liveNow : t.offlineNow) : t.mockFallback
  const metadataStateClass = metadata?.isLive ? 'is-live' : 'is-offline'
  const isRussian = t.navTop === 'Топ'
  const replayOptions = [1, 5, 20].map((value) => ({ value, label: `${value}x` }))
  const replayStatus = replay.error
    ? t.replayError
    : replay.status.isActive ? `${t.replayRunning} · ${replay.status.progress ?? 0}%` : t.replayIdle

  if (isDataModeLoading || isTwitchMode) {
    const connection = twitchIngest?.connection
    const ingestStatus = twitchIngest?.status
    const connected = dashboardMode === 'connected-channel'
      ? Boolean(!twitchIngest?.error)
      : Boolean(connection?.channelFound && connection?.ingestAccountFound && !connection?.needsReauth)
    const ingestState = ingestStatus?.status ?? 'stopped'
    const ingestRunning = ingestState === 'running'
    const ingestBusy = ['connecting', 'subscribing', 'reconnecting'].includes(ingestState)
    const statusError = twitchIngest?.error?.message || connection?.lastError || ingestStatus?.lastError
    const connectionLabel = connected
      ? t.twitchConnected
      : statusError ? t.twitchConnectionError : t.twitchDisconnected
    const ingestLabel = statusError || ingestState === 'error'
      ? t.ingestError
      : ingestRunning
        ? t.ingestRunning
        : ingestBusy ? t.ingestConnecting : t.ingestStopped
    const lastEventLabel = formatStatusTime(ingestStatus?.lastEventAt, isRussian) ?? t.noEventsYet
    const lastPollLabel = formatStatusTime(ingestStatus?.lastPollAt, isRussian) ?? '—'
    const collectionStartLabel = formatCollectionTime(ingestStatus?.collectedFrom, isRussian)
    const collectionGapNotice = collectionStartLabel && hasCollectionGap(ingestStatus?.streamStartedAt, ingestStatus?.collectedFrom)
      ? t.collectionGapNotice.replace('{time}', collectionStartLabel)
      : null
    const startLabel = twitchIngest?.isPending
      ? t.ingestRequestPending
      : ingestRunning || ingestBusy ? t.ingestAlreadyRunning : t.startIngest
    const stopLabel = twitchIngest?.isPending ? t.ingestRequestPending : t.stopIngest
    const runAuthorizedAction = (action) => {
      if (!canManageChannel) return Promise.resolve(null)
      return action()
    }
    const realStreamOptions = internalSessions.map((stream) => ({ value: stream.id, label: `${stream.title} · ${stream.date ?? t.notAvailable}` }))
    const realCompareOptions = [
      { value: '', label: t.compareOff },
      ...internalSessions.filter((stream) => stream.id !== selectedStreamId).map((stream) => ({ value: stream.id, label: `${stream.title} · ${stream.date ?? t.notAvailable}` })),
    ]
    const canReplay = Boolean(selectedSession?.samples?.length >= 2 && replay?.canReplay)
    const replayStatusLabel = replay?.status?.isActive
      ? `${t.replayRunning} · ${replay.status.progress}% · ${replay.status.currentTime ?? t.notAvailable}`
      : canReplay ? t.replayIdle : t.replayInsufficientSamples
    const exportDisabled = !selectedSession?.samples?.length || sessionDataLoading
    const exportSelectedCsv = () => downloadText(createSessionCsv(selectedSession), 'text/csv;charset=utf-8', sessionExportFilename(selectedSession, 'csv'))
    const exportSelectedReport = () => downloadText(createSessionReportHtml(selectedSession, {
      notAvailable: t.notAvailable,
      metrics: t.reportMetrics,
      duration: t.duration,
      averageViewers: t.averageViewers,
      peakViewers: t.peakViewers,
      totalMessages: t.streamMessages,
      uniqueChatters: t.sessionActiveChatters,
      activityPeak: t.activityPeak,
      topChatters: t.topChatters,
      topWords: t.reportTopWords,
      samples: t.reportSamples,
      time: t.time,
      viewers: t.viewers,
      messagesPerMinute: t.chatPerMin,
    }), 'text/html;charset=utf-8', sessionExportFilename(selectedSession, 'html'))
    const primaryIngestAction = canManageChannel ? (
      ingestRunning || ingestBusy ? (
        <button
          className="button button-primary control-primary-action"
          type="button"
          disabled={isDataModeLoading || twitchIngest?.isPending}
          onClick={() => runAuthorizedAction(twitchIngest.stop).catch(() => undefined)}
        >
          {stopLabel}
        </button>
      ) : (
        <button
          className="button button-primary control-primary-action"
          type="button"
          disabled={isDataModeLoading || twitchIngest?.isPending || !connected}
          onClick={() => runAuthorizedAction(twitchIngest.start).catch(() => undefined)}
        >
          {startLabel}
        </button>
      )
    ) : null

    return (
      <Reveal
        as="section"
        className="stream-control-bar twitch-control-bar glass-panel soft-glow liquid-glass liquid-surface-elevated"
        aria-label={t.streamControls}
        data-liquid-interactive
      >
        <div className="twitch-status-panel" aria-busy={isDataModeLoading || twitchIngest?.isPending ? 'true' : 'false'}>
          <div className="twitch-status-badges" aria-live="polite">
            <span className={`twitch-state-badge ${isDataModeLoading ? '' : connected ? 'is-connected' : statusError ? 'is-error' : ''}`}>
              {isDataModeLoading ? t.loadingMetadata : connectionLabel}
            </span>
            <span className={`twitch-state-badge is-${ingestState}`}>{ingestLabel}</span>
            <span className={`twitch-state-badge ${metadata?.isLive ? 'is-live' : 'is-offline'}`}>
              {metadata?.isLive ? t.streamLive : t.offlineNow}
            </span>
            {replay?.status?.isActive ? <span className="twitch-state-badge is-running">{replayStatusLabel}</span> : null}
          </div>
          <div className="stream-live-copy">
            <strong>{metadata?.streamTitle || metadata?.displayName || connection?.channelLogin || 'Twitch'}</strong>
            <span>{metadata?.categoryName || (metadata?.isLive === false ? t.offlineNow : t.loadingMetadata)}</span>
          </div>
          <div className="twitch-status-metrics">
            <MetricCard label={t.collectedMessages} value={persistedMessageCount} emptyLabel={t.notAvailable} />
            <MetricCard label={t.lastEvent} value={lastEventLabel} emptyLabel={t.notAvailable} />
            <MetricCard label={t.lastPoll} value={lastPollLabel === '—' ? null : lastPollLabel} emptyLabel={t.notAvailable} />
          </div>
          {statusError ? <StatusBanner variant="error">{statusError}</StatusBanner> : null}
          {collectionGapNotice ? <StatusBanner variant="warning">{collectionGapNotice}</StatusBanner> : null}
          {readOnlyAccess ? <span className="twitch-read-only-badge">{t.readOnlyAccess}</span> : null}
        </div>

        <div className="control-primary-row">
          <CustomSelect id="stream-select" label={t.currentStream} value={selectedStreamId} options={realStreamOptions.length ? realStreamOptions : [{ value: '', label: t.noInternalSessions }]} onChange={onStreamChange} disabled={!realStreamOptions.length} />
          {primaryIngestAction}
        </div>

        <details className="control-disclosure">
          <summary>{t.controls}</summary>
          <div className="session-control-grid">
            <CustomSelect id="compare-select" label={t.compare} value={compareStreamId} options={realCompareOptions} onChange={onCompareChange} disabled={realCompareOptions.length < 2} />
            <CustomSelect id="replay-speed" label={t.replaySpeed} value={replay?.speed ?? 1} options={[1, 2, 5, 10].map((value) => ({ value, label: `${value}x` }))} onChange={replay?.setSpeed} disabled={!canReplay} />
            <div className="replay-action-stack">
              <span className="replay-actions-label">{t.replayMode}<span className={`replay-state ${replay?.status?.isActive ? 'is-active' : ''}`} aria-live="polite">{replayStatusLabel}</span></span>
              <div className="replay-actions">
                <button className="button button-secondary" type="button" disabled={!canReplay || replay.status.isActive} onClick={replay.start}>{t.startReplay}</button>
                <button className="button button-secondary" type="button" disabled={!replay?.status?.isActive} onClick={replay.stop}>{t.stopReplay}</button>
              </div>
            </div>
          </div>
          <div className="control-technical-metrics">
            <MetricCard label={t.currentSessionEvents} value={ingestStatus ? ingestStatus.messagesStored ?? null : null} emptyLabel={t.notAvailable} />
          </div>
          <div className="twitch-ingest-actions session-export-actions">
            <button className="button button-secondary" type="button" disabled={exportDisabled} onClick={exportSelectedCsv}>{t.exportCsv}</button>
            <button className="button button-secondary" type="button" disabled={!selectedSession || sessionDataLoading} onClick={exportSelectedReport}>{t.generateReport}</button>
          </div>
        </details>
      </Reveal>
    )
  }

  function downloadMarkdownReport() {
    const link = document.createElement('a')
    link.href = `/api/streams/${encodeURIComponent(selectedStreamId)}/report/markdown`
    link.download = `${selectedStreamId}-report.md`
    link.click()
  }

  return (
    <Reveal
      as="section"
      className="stream-control-bar glass-panel soft-glow liquid-glass liquid-surface-elevated"
      aria-label={t.streamControls}
      data-liquid-interactive
    >
      <div className="stream-live-meta" aria-busy={twitchMetadata?.isLoading ? 'true' : 'false'}>
        <span className={`stream-live-status ${metadataStateClass} ${metadata?.isLive ? 'live-pulse' : ''}`}>
          {twitchMetadata?.isLoading ? t.loadingMetadata : liveLabel}
        </span>
        <div className="stream-live-copy">
          <strong>{metadataTitle}</strong>
          <span>{metadataCategory}</span>
          {replay.status.isActive ? <span className="replay-state is-active" aria-live="polite">{replayStatus}</span> : null}
        </div>
      </div>

      <div className="control-primary-row">
        <CustomSelect id="stream-select" label={t.currentStream} value={selectedStreamId} options={streamOptions} onChange={onStreamChange} />
        <button
          className="button button-primary control-primary-action"
          type="button"
          disabled={replay.isPending}
          onClick={() => (replay.status.isActive ? replay.stop() : replay.start()).catch(() => undefined)}
        >
          {replay.status.isActive ? t.stopReplay : t.startReplay}
        </button>
      </div>

      <details className="control-disclosure">
        <summary>{t.controls}</summary>
        <div className="control-secondary-grid">
          <CustomSelect id="compare-select" label={t.compare} value={compareStreamId} options={compareOptions} onChange={onCompareChange} />
          <CustomSelect id="replay-speed" label={t.replaySpeed} value={replay.speed} options={replayOptions} onChange={replay.setSpeed} />
        </div>
        <div className="export-actions">
          <ProgressActionButton className="button button-secondary" preparingLabel={preparingLabel} onAction={() => downloadCsv(selectedStream)}>
            {t.exportCsv}
          </ProgressActionButton>
          <button className="button button-secondary" type="button" disabled={streamSummary.isGenerating} onClick={() => streamSummary.generate().catch(() => undefined)}>
            {streamSummary.isGenerating ? t.generatingReport : t.generateReport}
          </button>
          {streamSummary.summary ? <button className="button button-tertiary" type="button" onClick={downloadMarkdownReport}>{t.downloadReport}</button> : null}
        </div>
        {streamSummary.error ? <StatusBanner className="control-feedback" variant="error">{t.reportError}</StatusBanner> : null}
        {!streamSummary.isLoading && !streamSummary.summary && !streamSummary.error ? <p className="control-feedback">{t.reportEmpty}</p> : null}
      </details>
    </Reveal>
  )
}

export default StreamControlBar
