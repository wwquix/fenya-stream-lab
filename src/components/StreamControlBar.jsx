import CustomSelect from './CustomSelect.jsx'
import { ProgressActionButton, Reveal } from './MotionPrimitives.jsx'
import { formatCategory, formatStreamTitle } from '../i18n/translations.js'
import { hasCollectionGap } from '../utils/dashboardUi.js'

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

function StreamControlBar({ streams, selectedStreamId, compareStreamId, onStreamChange, onCompareChange, twitchMetadata, twitchIngest, persistedMessageCount = 0, isTwitchMode, dashboardMode = 'mock', canManageChannel = false, readOnlyAccess = false, isDataModeLoading, theme, onToggleTheme, replay, streamSummary, t }) {
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
  const themeLabel = theme === 'light' ? t.switchToDarkTheme : t.switchToLightTheme
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

    return (
      <Reveal as="section" className="stream-control-bar twitch-control-bar glass-panel soft-glow" aria-label={t.streamControls}>
        <div className="twitch-status-panel" aria-busy={isDataModeLoading || twitchIngest?.isPending ? 'true' : 'false'}>
          <div className="twitch-status-badges" aria-live="polite">
            <span className={`twitch-state-badge ${isDataModeLoading ? '' : connected ? 'is-connected' : statusError ? 'is-error' : ''}`}>
              {isDataModeLoading ? t.loadingMetadata : connectionLabel}
            </span>
            <span className={`twitch-state-badge is-${ingestState}`}>{ingestLabel}</span>
            <span className={`twitch-state-badge ${metadata?.isLive ? 'is-live' : 'is-offline'}`}>
              {metadata?.isLive ? t.streamLive : t.offlineNow}
            </span>
          </div>
          <div className="stream-live-copy">
            <strong>{metadata?.streamTitle || metadata?.displayName || connection?.channelLogin || 'Twitch'}</strong>
            <span>{metadata?.categoryName || (metadata?.isLive === false ? t.offlineNow : t.loadingMetadata)}</span>
          </div>
          <dl className="twitch-status-metrics">
            <div><dt>{t.collectedMessages}</dt><dd>{persistedMessageCount}</dd></div>
            <div><dt>{t.currentSessionEvents}</dt><dd>{ingestStatus?.messagesStored ?? 0}</dd></div>
            <div><dt>{t.lastEvent}</dt><dd>{lastEventLabel}</dd></div>
            <div><dt>{t.lastPoll}</dt><dd>{lastPollLabel}</dd></div>
          </dl>
          {statusError ? <p className="twitch-status-error" role="alert">{statusError}</p> : null}
          {collectionGapNotice ? <p className="twitch-collection-notice" role="status">{collectionGapNotice}</p> : null}
          {readOnlyAccess ? <span className="twitch-read-only-badge">{t.readOnlyAccess}</span> : null}
        </div>

        <div className="twitch-ingest-actions">
          {canManageChannel ? <button
            className="liquid-button"
            type="button"
            disabled={isDataModeLoading || twitchIngest?.isPending || ingestRunning || ingestBusy || !connected}
            onClick={() => runAuthorizedAction(twitchIngest.start).catch(() => undefined)}
          >
            {startLabel}
          </button> : null}
          {canManageChannel ? <button
            className="liquid-button"
            type="button"
            disabled={isDataModeLoading || twitchIngest?.isPending || (!ingestRunning && !ingestBusy)}
            onClick={() => runAuthorizedAction(twitchIngest.stop).catch(() => undefined)}
          >
            {stopLabel}
          </button> : null}
          <button className="theme-toggle liquid-button" type="button" onClick={onToggleTheme} aria-label={themeLabel} title={themeLabel}>
            <span aria-hidden="true" />
            {themeLabel}
          </button>
        </div>
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
    <Reveal as="section" className="stream-control-bar glass-panel soft-glow" aria-label={t.streamControls}>
      <div className="stream-live-meta" aria-busy={twitchMetadata?.isLoading ? 'true' : 'false'}>
        <span className={`stream-live-status ${metadataStateClass} ${metadata?.isLive ? 'live-pulse' : ''}`}>
          {twitchMetadata?.isLoading ? t.loadingMetadata : liveLabel}
        </span>
        <div className="stream-live-copy">
          <strong>{metadataTitle}</strong>
          <span>{metadataCategory}</span>
        </div>
      </div>

      <CustomSelect id="stream-select" label={t.currentStream} value={selectedStreamId} options={streamOptions} onChange={onStreamChange} />
      <CustomSelect id="compare-select" label={t.compare} value={compareStreamId} options={compareOptions} onChange={onCompareChange} />

      <div className="replay-controls" aria-label={t.replayMode} aria-busy={replay.isPending ? 'true' : 'false'}>
        <CustomSelect id="replay-speed" label={t.replaySpeed} value={replay.speed} options={replayOptions} onChange={replay.setSpeed} />
        <div className="replay-action-stack">
          <span className="replay-actions-label">
            {t.replayMode}
            <span className={`replay-state ${replay.status.isActive ? 'is-active' : ''}`} aria-live="polite">{replayStatus}</span>
          </span>
          <div className="replay-actions">
            <button className="liquid-button" type="button" disabled={replay.isPending || replay.status.isActive} onClick={() => replay.start().catch(() => undefined)}>{t.startReplay}</button>
            <button className="liquid-button" type="button" disabled={replay.isPending || !replay.status.isActive} onClick={() => replay.stop().catch(() => undefined)}>{t.stopReplay}</button>
          </div>
        </div>
      </div>

      <div className="export-actions">
        <button className="theme-toggle liquid-button" type="button" onClick={onToggleTheme} aria-label={themeLabel} title={themeLabel}>
          <span aria-hidden="true" />
          {themeLabel}
        </button>
        <ProgressActionButton className="liquid-button" preparingLabel={preparingLabel} onAction={() => downloadCsv(selectedStream)}>
          {t.exportCsv}
        </ProgressActionButton>
        <button className="liquid-button" type="button" disabled={streamSummary.isGenerating} onClick={() => streamSummary.generate().catch(() => undefined)}>
          {streamSummary.isGenerating ? t.generatingReport : t.generateReport}
        </button>
        {streamSummary.summary ? <button className="liquid-button" type="button" onClick={downloadMarkdownReport}>{t.downloadReport}</button> : null}
      </div>
      {streamSummary.error ? <p className="control-feedback is-error" role="alert">{t.reportError}</p> : null}
      {!streamSummary.isLoading && !streamSummary.summary && !streamSummary.error ? <p className="control-feedback">{t.reportEmpty}</p> : null}
    </Reveal>
  )
}

export default StreamControlBar
