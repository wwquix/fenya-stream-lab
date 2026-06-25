import CustomSelect from './CustomSelect.jsx'
import { ProgressActionButton, Reveal } from './MotionPrimitives.jsx'
import { formatStreamTitle } from '../i18n/translations.js'

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

function StreamControlBar({ streams, selectedStreamId, compareStreamId, onStreamChange, onCompareChange, t }) {
  const selectedStream = streams.find((stream) => stream.id === selectedStreamId) ?? streams[0]
  const streamOptions = streams.map((stream) => ({ value: stream.id, label: formatStreamTitle(stream, t) }))
  const preparingLabel = t.exportReport === 'Отчёт' ? 'Готовим...' : 'Preparing...'
  const compareOptions = [
    { value: '', label: t.compareOff },
    ...streams.filter((stream) => stream.id !== selectedStreamId).map((stream) => ({ value: stream.id, label: formatStreamTitle(stream, t) })),
  ]

  return (
    <Reveal as="section" className="stream-control-bar glass-panel" aria-label="Stream controls">
      <CustomSelect id="stream-select" label={t.currentStream} value={selectedStreamId} options={streamOptions} onChange={onStreamChange} />
      <CustomSelect id="compare-select" label={t.compare} value={compareStreamId} options={compareOptions} onChange={onCompareChange} />

      <div className="export-actions">
        <ProgressActionButton preparingLabel={preparingLabel} onAction={() => downloadCsv(selectedStream)}>
          {t.exportCsv}
        </ProgressActionButton>
        <ProgressActionButton preparingLabel={preparingLabel} onAction={() => window.print()}>
          {t.exportReport}
        </ProgressActionButton>
      </div>
    </Reveal>
  )
}

export default StreamControlBar
