import ScannerTooltip from './ScannerTooltip.jsx'
import { AnimatedNumber, Reveal, RippleSurface } from './MotionPrimitives.jsx'
import { formatStreamTitle } from '../i18n/translations.js'

function formatPlainInteger(value) {
  return Math.round(value).toString()
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
              {stream.id === selectedStreamId ? <span className="current-marker">{t.selectedStream}</span> : null}
              <span className="archive-date">{stream.date}</span>
              <strong>{formatStreamTitle(stream, t)}</strong>
              <dl>
                <div>
                  <dt>{t.duration}</dt>
                  <dd>{stream.duration}</dd>
                </div>
                <div>
                  <dt>{t.peak}</dt>
                  <dd>
                    <AnimatedNumber value={stream.metrics.peakViewers} format={formatPlainInteger} />
                  </dd>
                </div>
                <div>
                  <dt>{t.word}</dt>
                  <dd>{stream.dominantWord}</dd>
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
