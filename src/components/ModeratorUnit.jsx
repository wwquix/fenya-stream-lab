import { useState } from 'react'
import ScannerTooltip from './ScannerTooltip.jsx'
import { AnimatedNumber, MotionCard, Reveal } from './MotionPrimitives.jsx'
import { formatStatusLabel } from '../i18n/translations.js'

function formatPlainInteger(value) {
  return Math.round(value).toString()
}

function getBackendModeratorId(nickname, index) {
  const slug = nickname.toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `backend-moderator-${slug || index + 1}`
}

function adaptBackendModerators(moderationAnalytics) {
  if (!Array.isArray(moderationAnalytics?.moderators) || moderationAnalytics.moderators.length === 0) {
    return null
  }

  return moderationAnalytics.moderators.map((moderator, index) => ({
    id: getBackendModeratorId(moderator.nickname, index),
    name: moderator.nickname,
    actions: moderator.actions,
    bans: moderator.bans,
    timeouts: moderator.timeouts,
    deletedMessages: moderator.deletedMessages,
    reactionTime: `${moderator.responseTimeSec.toFixed(1)}s`,
    efficiency: moderator.accuracy,
    status: moderator.status,
  }))
}

function ModeratorUnit({ moderators, events, moderationAnalytics, t }) {
  const [showAllModerators, setShowAllModerators] = useState(false)
  const backendModerators = adaptBackendModerators(moderationAnalytics)
  const activeModerators = backendModerators ?? moderators
  const visibleModerators = showAllModerators ? activeModerators : activeModerators.slice(0, 4)

  return (
    <Reveal as="section" className="section-panel moderator-unit" id="moderators" aria-labelledby="moderator-unit-title">
      <div className="section-heading">
        <div>
          {t.moderatorKicker ? <p className="eyebrow">{t.moderatorKicker}</p> : null}
          <h2 id="moderator-unit-title">{t.moderatorPerformance}</h2>
          <p className="section-note">{t.moderatorNote}</p>
        </div>
        <button className="moderator-toggle" type="button" onClick={() => setShowAllModerators((isShown) => !isShown)}>
          {showAllModerators ? t.showLess : `${t.showAll} ${activeModerators.length}`}
        </button>
      </div>

      <div className="moderator-grid">
        {visibleModerators.map((moderator) => {
          const linkedEvents = events.filter((event) => event.moderatorId === moderator.id)

          return (
            <ScannerTooltip as={MotionCard} key={moderator.id} type="moderator" id={moderator.id} label={`${moderator.actions ?? linkedEvents.length} ${t.linkedActions}`} className="moderator-card glass-panel">
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
                  <dt>{moderator.deletedMessages === undefined ? t.unbans : t.deletedMessages}</dt>
                  <dd>
                    <AnimatedNumber value={moderator.deletedMessages ?? moderator.unbans} format={formatPlainInteger} />
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
