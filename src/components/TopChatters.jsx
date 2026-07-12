import { useState } from 'react'
import { AnimatedNumber, MotionCard, Reveal } from './MotionPrimitives.jsx'
import SessionInsights from './SessionInsights.jsx'
import { buildChatLeaderboards } from '../utils/sessionDashboard.js'

function formatPlainInteger(value) {
  return Math.round(value).toLocaleString()
}

function getWatchMinutes(watchTime = '') {
  const hours = Number.parseInt(String(watchTime).match(/(\d+)h/)?.[1] ?? '0', 10)
  const minutes = Number.parseInt(String(watchTime).match(/(\d+)m/)?.[1] ?? '0', 10)
  return hours * 60 + minutes
}

function LeaderboardList({ metricLabel, items, renderMetric, emptyMessage, calculatedLabel = null }) {
  if (!items.length) return <p className="leaderboard-empty">{emptyMessage}</p>
  return (
    <>
      {calculatedLabel ? <p className="leaderboard-calculated-note">{calculatedLabel}</p> : null}
      <ol>
        {items.slice(0, 5).map((chatter, index) => (
          <li key={`${chatter.nickname}-${index}`}>
            <span className="leaderboard-rank">{index + 1}</span>
            <span className="leaderboard-avatar" aria-hidden="true">{chatter.nickname.slice(0, 1).toLocaleUpperCase()}</span>
            <div><strong>{chatter.nickname}</strong><small>{chatter.note ?? metricLabel}</small></div>
            <em aria-label={metricLabel}>{renderMetric(chatter)}</em>
          </li>
        ))}
      </ol>
    </>
  )
}

function TabbedLeaderboard({ title, tabs, initialTabId, revealDelay = 0 }) {
  const [activeTabId, setActiveTabId] = useState(initialTabId ?? tabs[0].id)
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0]
  return (
    <MotionCard as="article" className="chat-leaderboard glass-panel liquid-card subtle-shine" revealDelay={revealDelay}>
      <div className="chat-leaderboard-header">
        <h3>{title}</h3>
        <div className="leaderboard-tabs" role="tablist" aria-label={title}>
          {tabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={activeTab.id === tab.id} className={activeTab.id === tab.id ? 'is-active' : ''} onClick={() => setActiveTabId(tab.id)}>{tab.label}</button>)}
        </div>
      </div>
      <LeaderboardList {...activeTab} />
    </MotionCard>
  )
}

function mockLeaderboards(chatters) {
  const messages = [...chatters].sort((a, b) => b.messages - a.messages).map((item) => ({ ...item, value: item.messages }))
  const time = [...chatters].sort((a, b) => getWatchMinutes(b.watchTime) - getWatchMinutes(a.watchTime)).map((item) => ({ ...item, value: getWatchMinutes(item.watchTime) }))
  const pace = [...messages].map((item) => ({ ...item, value: Number.parseFloat(String(item.multiplier).replace('x', '')) || 0 }))
  const engagement = [...messages].map((item) => ({ ...item, value: Math.min(100, Math.round(item.messages / 10 + getWatchMinutes(item.watchTime) / 5)) }))
  return { messages, time, pace, engagement }
}

function TopChatters({ chatters, chatAnalytics = null, realDataMode = false, session = null, ingestStatus = null, error = null, t }) {
  const leaderboards = realDataMode ? buildChatLeaderboards(chatAnalytics) : mockLeaderboards(chatters)
  const totalMessages = session?.totalMessages ?? chatAnalytics?.totalMessages ?? (realDataMode ? 0 : chatters.reduce((sum, chatter) => sum + chatter.messages, 0))
  const activeChatters = session?.uniqueChatters ?? chatAnalytics?.activeNow ?? (realDataMode ? 0 : chatters.length)
  const activityPeak = session?.activityPeak ?? chatAnalytics?.activityPeak ?? null
  return (
    <Reveal as="section" className="section-panel top-chatters" id="chatters" aria-labelledby="top-chatters-title">
      <div className="section-heading"><div className="liquid-card hover-lift"><h2 id="top-chatters-title">{t.viewersAndChat}</h2></div></div>
      {error ? <p className="section-inline-error" role="alert">{t.chatSectionPartialError}</p> : null}
      <div className="chat-summary-metrics" aria-label={t.viewersAndChat}>
        <div className="liquid-card hover-lift"><span>{t.sessionActiveChatters}</span><strong><AnimatedNumber value={activeChatters} format={formatPlainInteger} /></strong></div>
        <div className="liquid-card hover-lift"><span>{t.streamMessages}</span><strong><AnimatedNumber value={totalMessages} format={formatPlainInteger} /></strong></div>
        <div className="liquid-card hover-lift"><span>{t.activityPeak}</span><strong>{activityPeak === null ? t.notAvailable : `x${activityPeak}`}</strong></div>
      </div>
      <div className="chat-dashboard is-three-column">
        <div className="chat-leaderboards chat-leaderboards-left">
          <TabbedLeaderboard title={t.topChatters} revealDelay={0.04} tabs={[
            { id: 'messages', label: t.messagesTab, metricLabel: t.messages, items: leaderboards.messages, renderMetric: (item) => formatPlainInteger(item.value), emptyMessage: t.noChatterRanking },
            { id: 'time', label: t.watchTimeTab, metricLabel: t.observedActivitySpan, items: leaderboards.time, renderMetric: (item) => `${item.value} ${t.minutesShort}`, emptyMessage: t.noObservedTime },
          ]} />
        </div>
        <SessionInsights session={session} ingestStatus={ingestStatus} error={error} t={t} />
        <div className="chat-leaderboards chat-leaderboards-right">
          <TabbedLeaderboard title={t.activityLeaderboardTitle} revealDelay={0.16} tabs={[
            { id: 'pace', label: t.paceTab, metricLabel: t.messageFrequency, items: leaderboards.pace, renderMetric: (item) => `${item.value}/${t.minutesShort}`, emptyMessage: t.noPaceData },
            { id: 'engagement', label: t.engagementTab, metricLabel: t.calculatedEngagement, items: leaderboards.engagement, renderMetric: (item) => `${item.value}/100`, emptyMessage: t.noEngagementData, calculatedLabel: t.engagementCalculatedNote },
          ]} />
        </div>
      </div>
    </Reveal>
  )
}

export default TopChatters
