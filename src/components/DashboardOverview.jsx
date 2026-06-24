import { formatCategory, formatSummaryValue } from '../i18n/translations.js'
import { MotionCard, Reveal } from './MotionPrimitives.jsx'

function getAverageReactionTime(moderators) {
  const seconds = moderators
    .map((moderator) => Number.parseFloat(moderator.reactionTime))
    .filter((value) => Number.isFinite(value))

  if (!seconds.length) {
    return 'n/a'
  }

  const average = seconds.reduce((total, value) => total + value, 0) / seconds.length
  return `${average.toFixed(1)}s`
}

function DashboardOverview({ stream, moderators, events, chatters, t }) {
  const streamEvents = events.filter((event) => event.streamId === stream.id)
  const moderationEvents = streamEvents.filter((event) => event.type === 'ban' || event.type === 'timeout')
  const topChatter = chatters.reduce((top, chatter) => (chatter.messages > top.messages ? chatter : top), chatters[0])
  const averageReaction = getAverageReactionTime(moderators)
  const moderatorLoad = moderationEvents.length >= 4 ? 'High' : moderationEvents.length >= 2 ? 'Medium' : 'Low'
  const fallbackHealth = stream.metrics.toxicityIndex >= 75 ? 'Intense but stable' : stream.metrics.toxicityIndex >= 55 ? 'Balanced activity' : 'Calm session'

  const cards = [
    {
      label: t.peakMoment,
      value: formatSummaryValue(stream.summary?.peakMoment ?? 'n/a', t),
      detail: t.highestAudience,
      variant: 'highlight',
    },
    {
      label: t.strongestChatSpike,
      value: formatSummaryValue(stream.summary?.strongestChatSpike ?? 'n/a', t),
      detail: t.busiestChat,
      variant: 'highlight',
    },
    {
      label: t.mainCategory,
      value: formatCategory(stream.summary?.bestCategory ?? stream.category, t),
      detail: t.mostActiveSegment,
    },
    {
      label: t.moderatorLoad,
      value: formatSummaryValue(stream.summary?.moderatorLoad ?? moderatorLoad, t),
      detail: `${moderationEvents.length} ${t.event.toLowerCase()}, ${averageReaction} ${t.averageReaction}`,
    },
    {
      label: t.sessionHealth,
      value: formatSummaryValue(stream.summary?.sessionHealth ?? fallbackHealth, t),
      detail: t.combinedPressure,
    },
    {
      label: t.topChatter,
      value: topChatter.nickname,
      detail: `${topChatter.messages.toLocaleString()} ${t.messages}, ${topChatter.watchTime} ${t.watchTime}`,
    },
  ]

  return (
    <Reveal as="section" className="section-panel dashboard-overview" id="summary" aria-labelledby="dashboard-overview-title" data-entity-type="stream" data-entity-id={stream.id}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">{t.summaryKicker}</p>
          <h2 id="dashboard-overview-title">{t.currentStreamSummary}</h2>
          <p className="section-note">{t.summaryNote}</p>
        </div>
        <span className="section-kicker">{stream.date}</span>
      </div>

      <div className="overview-grid">
        {cards.map((card) => (
          <MotionCard as="article" className={`overview-card glass-panel ${card.variant ? `is-${card.variant}` : ''}`} key={card.label}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <p>{card.detail}</p>
          </MotionCard>
        ))}
      </div>
    </Reveal>
  )
}

export default DashboardOverview
