import ScannerTooltip from './ScannerTooltip.jsx'
import { AnimatedNumber, Reveal, RippleSurface } from './MotionPrimitives.jsx'
import { formatDominantWord } from '../i18n/translations.js'

function formatPlainInteger(value) {
  return Math.round(value).toString()
}

function formatArchiveDate(value, t) {
  const date = new Date(`${value}T00:00:00`)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  const isRussian = t.navTop === 'Топ'

  return new Intl.DateTimeFormat(isRussian ? 'ru-RU' : 'en-US', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

function formatDuration(value, t) {
  if (t.navTop !== 'Топ') {
    return value
  }

  return value.replace(/(\d+)h\s*(\d+)m/, '$1ч $2м')
}

function formatDurationMinutes(durationMinutes) {
  const hours = Math.floor(durationMinutes / 60)
  const minutes = durationMinutes % 60
  return `${hours}h ${minutes}m`
}

function adaptBackendStreams(archive) {
  if (!Array.isArray(archive?.streams) || archive.streams.length === 0) {
    return null
  }

  return archive.streams.map((stream) => ({
    id: stream.streamId.startsWith('stream-') ? stream.streamId : `stream-${stream.streamId}`,
    title: stream.title,
    date: stream.date,
    duration: formatDurationMinutes(stream.durationMinutes),
    category: stream.categoryName,
    dominantWord: stream.topWords[0],
    metrics: {
      peakViewers: stream.peakViewers,
      chatMessages: stream.totalMessages,
      activeChatters: stream.uniqueChatters,
      moderatorActions: stream.moderationActions,
    },
    archiveMetrics: {
      averageViewers: stream.averageViewers,
      topMoment: stream.topMoment,
      summary: stream.summary,
    },
  }))
}

function StreamArchive({ streams, archive, selectedStreamId, t }) {
  const activeStreams = adaptBackendStreams(archive) ?? streams

  return (
    <Reveal as="section" className="section-panel stream-archive" id="archive" aria-labelledby="stream-archive-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{t.archiveKicker}</p>
          <h2 id="stream-archive-title">{t.streamArchive}</h2>
          <p className="section-note">{t.archiveNote}</p>
        </div>
      </div>

      <div className="archive-bookshelf" aria-label="Stream archive bookshelf">
        <div className="archive-track">
        {activeStreams.map((stream, index) => (
          <ScannerTooltip as={RippleSurface} key={stream.id} type="stream" id={stream.id} label={stream.title} className={`archive-book liquid-card ${stream.id === selectedStreamId ? 'is-current' : ''}`} revealDelay={Math.min(index, 9) * 0.04}>
            <div className="archive-book-spine" aria-hidden="true" />
            <div className="archive-book-content">
              <div className="archive-book-topline">
                <span className="archive-date">{formatArchiveDate(stream.date, t)}</span>
                {stream.id === selectedStreamId ? <span className="current-marker">{t.selectedStream}</span> : null}
              </div>
              <h3 className="archive-book-title">{stream.title}</h3>
              <span className="archive-divider" aria-hidden="true" />
              <dl>
                <div>
                  <dt>{t.duration}</dt>
                  <dd>{formatDuration(stream.duration, t)}</dd>
                </div>
                <div>
                  <dt>{t.peak}</dt>
                  <dd>
                    <AnimatedNumber value={stream.metrics.peakViewers} format={formatPlainInteger} />
                  </dd>
                </div>
                <div>
                  <dt>{t.word}</dt>
                  <dd>{formatDominantWord(stream.dominantWord, t)}</dd>
                </div>
                <div>
                  <dt>{stream.archiveMetrics ? t.moderationActions : t.activity}</dt>
                  <dd>
                    <AnimatedNumber value={stream.archiveMetrics ? stream.metrics.moderatorActions : stream.metrics.toxicityIndex} format={formatPlainInteger} />
                    {stream.archiveMetrics ? null : '/100'}
                  </dd>
                </div>
              </dl>
            </div>
          </ScannerTooltip>
        ))}
        </div>
      </div>
    </Reveal>
  )
}

export default StreamArchive
