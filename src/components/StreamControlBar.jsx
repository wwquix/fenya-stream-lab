import CustomSelect from './CustomSelect.jsx'
import { ProgressActionButton, Reveal } from './MotionPrimitives.jsx'
import { formatCategory, formatStreamTitle } from '../i18n/translations.js'

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

function StreamControlBar({ streams, selectedStreamId, compareStreamId, onStreamChange, onCompareChange, twitchMetadata, theme, onToggleTheme, replay, streamSummary, t }) {
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
  const themeLabel = theme === 'light'
    ? (isRussian ? 'Тёмная тема' : 'Dark theme')
    : (isRussian ? 'Светлая тема' : 'Light theme')
  const replayOptions = [1, 5, 20].map((value) => ({ value, label: `${value}x` }))
  const replayStatus = replay.error
    ? t.replayError
    : replay.status.isActive ? `${t.replayRunning} · ${replay.status.progress ?? 0}%` : t.replayIdle

  function downloadMarkdownReport() {
    const link = document.createElement('a')
    link.href = `/api/streams/${encodeURIComponent(selectedStreamId)}/report/markdown`
    link.download = `${selectedStreamId}-report.md`
    link.click()
  }

  return (
    <Reveal as="section" className="stream-control-bar glass-panel soft-glow" aria-label="Stream controls">
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
        <div className="replay-actions">
          <button className="liquid-button" type="button" disabled={replay.isPending || replay.status.isActive} onClick={() => replay.start().catch(() => undefined)}>{t.startReplay}</button>
          <button className="liquid-button" type="button" disabled={replay.isPending || !replay.status.isActive} onClick={() => replay.stop().catch(() => undefined)}>{t.stopReplay}</button>
        </div>
        <span className={`replay-state ${replay.status.isActive ? 'is-active' : ''}`} aria-live="polite">{replayStatus}</span>
      </div>

      <div className="export-actions">
        <button className="theme-toggle liquid-button" type="button" onClick={onToggleTheme} aria-label={themeLabel} title={themeLabel}>
          <span aria-hidden="true" />
          {theme === 'light' ? (isRussian ? 'Тёмная' : 'Dark') : (isRussian ? 'Светлая' : 'Light')}
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
