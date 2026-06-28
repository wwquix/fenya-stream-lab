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

function getLargestHighlight(highlights, field) {
  return highlights.reduce((largest, highlight) => (
    (highlight[field] ?? -1) > (largest?.[field] ?? -1) ? highlight : largest
  ), null)
}

function createBackendCards(streamSummary, t) {
  if (!streamSummary?.metrics || !streamSummary.topChatters?.length || !streamSummary.insights?.length) {
    return null
  }

  const viewerPeak = getLargestHighlight(streamSummary.highlights ?? [], 'viewers')
  const chatPeak = getLargestHighlight(streamSummary.highlights ?? [], 'messagesPerMinute')
  const topChatter = streamSummary.topChatters[0]
  const numberFormat = new Intl.NumberFormat()

  return [
    {
      label: t.peakMoment,
      value: viewerPeak
        ? `${viewerPeak.time} · ${numberFormat.format(viewerPeak.viewers)}`
        : numberFormat.format(streamSummary.metrics.peakViewers),
      detail: viewerPeak?.label ?? t.highestAudience,
      variant: 'highlight',
    },
    {
      label: t.strongestChatSpike,
      value: chatPeak
        ? `${chatPeak.time} · ${numberFormat.format(chatPeak.messagesPerMinute)}/${t.chatPerMin.split('/').at(-1).trim()}`
        : numberFormat.format(streamSummary.metrics.totalMessages),
      detail: chatPeak?.label ?? t.busiestChat,
      variant: 'highlight',
    },
    {
      label: t.mainCategory,
      value: formatCategory(streamSummary.categoryName, t),
      detail: t.mostActiveSegment,
    },
    {
      label: t.moderatorLoad,
      value: numberFormat.format(streamSummary.metrics.moderationActions),
      detail: `${numberFormat.format(streamSummary.metrics.timeouts)} ${t.timeouts}, ${numberFormat.format(streamSummary.metrics.bans)} ${t.bans}`,
    },
    {
      label: t.sessionHealth,
      value: streamSummary.verdict,
      detail: streamSummary.insights[0],
    },
    {
      label: t.topChatter,
      value: topChatter.nickname,
      detail: `${numberFormat.format(topChatter.messages)} ${t.messages}${topChatter.note ? `, ${topChatter.note}` : ''}`,
    },
  ]
}

function DashboardOverview({ stream, moderators, events, chatters, streamSummary, t }) {
  const streamEvents = events.filter((event) => event.streamId === stream.id)
  const moderationEvents = streamEvents.filter((event) => event.type === 'ban' || event.type === 'timeout')
  const topChatter = chatters.reduce((top, chatter) => (chatter.messages > top.messages ? chatter : top), chatters[0])
  const averageReaction = getAverageReactionTime(moderators)
  const moderatorLoad = moderationEvents.length >= 4 ? 'High' : moderationEvents.length >= 2 ? 'Medium' : 'Low'
  const fallbackHealth = stream.metrics.toxicityIndex >= 75 ? 'Intense but stable' : stream.metrics.toxicityIndex >= 55 ? 'Balanced activity' : 'Calm session'

  const fallbackCards = [
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
  const cards = createBackendCards(streamSummary, t) ?? fallbackCards

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
        {cards.map((card, index) => (
          <MotionCard as="article" className={`overview-card glass-panel liquid-card subtle-shine ${card.variant ? `is-${card.variant}` : ''}`} revealDelay={index * 0.045} key={card.label}>
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
