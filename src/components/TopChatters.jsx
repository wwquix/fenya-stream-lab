import ScannerTooltip from './ScannerTooltip.jsx'
import { AnimatedNumber, MotionCard, Reveal } from './MotionPrimitives.jsx'
import { formatStatusLabel } from '../i18n/translations.js'

function formatPlainInteger(value) {
  return Math.round(value).toString()
}

function TopChatters({ chatters, t }) {
  return (
    <Reveal as="section" className="section-panel top-chatters" id="chatters" aria-labelledby="top-chatters-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{t.topChattersKicker}</p>
          <h2 id="top-chatters-title">{t.topChatters}</h2>
          <p className="section-note">{t.topChattersNote}</p>
        </div>
      </div>

      <div className="specimen-grid">
        {chatters.slice(0, 6).map((chatter) => (
          <ScannerTooltip as={MotionCard} key={chatter.id} type="chatter" id={chatter.id} label={formatStatusLabel(chatter.status, t)} className="specimen-card glass-panel">
            <div className="specimen-topline">
              <div>
                <span className="specimen-index">{t.topContributor}</span>
                <strong>{chatter.nickname}</strong>
              </div>
              <span className="multiplier-badge">{chatter.multiplier}</span>
            </div>
            <dl>
              <div>
                <dt>{t.messages}</dt>
                <dd>
                  <AnimatedNumber value={chatter.messages} format={formatPlainInteger} />
                </dd>
              </div>
              <div>
                <dt>{t.watchTime}</dt>
                <dd>{chatter.watchTime}</dd>
              </div>
            </dl>
            <p className="bio-label">{formatStatusLabel(chatter.status, t)}</p>
          </ScannerTooltip>
        ))}
      </div>
    </Reveal>
  )
}

export default TopChatters
