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

function StreamControlBar({ streams, selectedStreamId, compareStreamId, onStreamChange, onCompareChange, twitchMetadata, t }) {
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

      <div className="export-actions">
        <ProgressActionButton className="liquid-button" preparingLabel={preparingLabel} onAction={() => downloadCsv(selectedStream)}>
          {t.exportCsv}
        </ProgressActionButton>
        <ProgressActionButton className="liquid-button" preparingLabel={preparingLabel} onAction={() => window.print()}>
          {t.exportReport}
        </ProgressActionButton>
      </div>
    </Reveal>
  )
}

export default StreamControlBar
