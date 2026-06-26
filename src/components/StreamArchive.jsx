import ScannerTooltip from './ScannerTooltip.jsx'
import { AnimatedNumber, Reveal, RippleSurface } from './MotionPrimitives.jsx'
import { formatDominantWord, formatStreamTitle } from '../i18n/translations.js'

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

function StreamArchive({ streams, selectedStreamId, t }) {
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
        {streams.map((stream) => (
          <ScannerTooltip as={RippleSurface} key={stream.id} type="stream" id={stream.id} label={formatStreamTitle(stream, t)} className={`archive-book ${stream.id === selectedStreamId ? 'is-current' : ''}`}>
            <div className="archive-book-spine" aria-hidden="true" />
            <div className="archive-book-content">
              <div className="archive-book-topline">
                <span className="archive-date">{formatArchiveDate(stream.date, t)}</span>
                {stream.id === selectedStreamId ? <span className="current-marker">{t.selectedStream}</span> : null}
              </div>
              <strong>{formatStreamTitle(stream, t)}</strong>
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
                  <dt>{t.activity}</dt>
                  <dd>
                    <AnimatedNumber value={stream.metrics.toxicityIndex} format={formatPlainInteger} />/100
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
