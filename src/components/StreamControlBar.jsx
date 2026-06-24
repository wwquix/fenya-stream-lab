import CustomSelect from './CustomSelect.jsx'
import { ProgressActionButton, Reveal } from './MotionPrimitives.jsx'
import { motion, useReducedMotion } from "motion/react"
import { formatCategory, formatStreamTitle } from '../i18n/translations.js'

const categories = ['All', 'Just Chatting', 'CS2', 'Minecraft', 'Other']

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

function StreamControlBar({ streams, selectedStreamId, compareStreamId, selectedCategory, onStreamChange, onCompareChange, onCategoryChange, t }) {
  const prefersReducedMotion = useReducedMotion()
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

      <div className="category-filter" aria-label="Category filter">
        {categories.map((category) => (
          <button className={selectedCategory === category ? 'is-active' : ''} type="button" onClick={() => onCategoryChange(category)} key={category}>
            {selectedCategory === category ? (
              <motion.span
                className="segmented-active-indicator"
                layoutId="category-filter-active"
                transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                aria-hidden="true"
              />
            ) : null}
            <span className="segmented-label">{category === 'All' ? t.all : formatCategory(category, t)}</span>
          </button>
        ))}
      </div>

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
