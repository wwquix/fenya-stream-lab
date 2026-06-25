import { useState } from 'react'
import ScannerTooltip from './ScannerTooltip.jsx'
import { AnimatedNumber, MotionCard, Reveal } from './MotionPrimitives.jsx'
import { formatStatusLabel } from '../i18n/translations.js'

function formatPlainInteger(value) {
  return Math.round(value).toString()
}

function ModeratorUnit({ moderators, events, t }) {
  const [showAllModerators, setShowAllModerators] = useState(false)
  const visibleModerators = showAllModerators ? moderators : moderators.slice(0, 4)

  return (
    <Reveal as="section" className="section-panel moderator-unit" id="moderators" aria-labelledby="moderator-unit-title">
      <div className="section-heading">
        <div>
          {t.moderatorKicker ? <p className="eyebrow">{t.moderatorKicker}</p> : null}
          <h2 id="moderator-unit-title">{t.moderatorPerformance}</h2>
          <p className="section-note">{t.moderatorNote}</p>
        </div>
        <button className="moderator-toggle" type="button" onClick={() => setShowAllModerators((isShown) => !isShown)}>
          {showAllModerators ? t.showLess : `${t.showAll} ${moderators.length}`}
        </button>
      </div>

      <div className="moderator-grid">
        {visibleModerators.map((moderator) => {
          const linkedEvents = events.filter((event) => event.moderatorId === moderator.id)

          return (
            <ScannerTooltip as={MotionCard} key={moderator.id} type="moderator" id={moderator.id} label={`${linkedEvents.length} ${t.linkedActions}`} className="moderator-card glass-panel">
              <div className="moderator-header">
                <div>
                  <span className="unit-label">{t.moderator}</span>
                  <strong>{moderator.name}</strong>
                </div>
                <span className="unit-dot" aria-hidden="true" />
              </div>
              <p className="moderator-status">{formatStatusLabel(moderator.status, t)}</p>
              <dl>
                <div>
                  <dt>{t.bans}</dt>
                  <dd>
                    <AnimatedNumber value={moderator.bans} format={formatPlainInteger} />
                  </dd>
                </div>
                <div>
                  <dt>{t.timeouts}</dt>
                  <dd>
                    <AnimatedNumber value={moderator.timeouts} format={formatPlainInteger} />
                  </dd>
                </div>
                <div>
                  <dt>{t.unbans}</dt>
                  <dd>
                    <AnimatedNumber value={moderator.unbans} format={formatPlainInteger} />
                  </dd>
                </div>
                <div>
                  <dt>{t.reaction}</dt>
                  <dd>{moderator.reactionTime}</dd>
                </div>
              </dl>
              <div className="efficiency-meter">
                <span className="efficiency">
                  {t.efficiency} <AnimatedNumber value={moderator.efficiency} format={formatPlainInteger} />%
                </span>
                <span className="meter-track" aria-hidden="true">
                  <span className="meter-fill" style={{ width: `${moderator.efficiency}%` }} />
                </span>
              </div>
            </ScannerTooltip>
          )
        })}
      </div>
    </Reveal>
  )
}

export default ModeratorUnit
