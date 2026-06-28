import { useState } from 'react'
import { AnimatedNumber, MotionCard, Reveal } from './MotionPrimitives.jsx'
import ConsoleRush from './ConsoleRush.jsx'
import { formatStatusLabel } from '../i18n/translations.js'

function formatPlainInteger(value) {
  return Math.round(value).toLocaleString()
}

function getWatchMinutes(watchTime) {
  const hours = Number.parseInt(watchTime.match(/(\d+)h/)?.[1] ?? '0', 10)
  const minutes = Number.parseInt(watchTime.match(/(\d+)m/)?.[1] ?? '0', 10)
  return hours * 60 + minutes
}

function getMultiplierValue(multiplier) {
  return Number.parseFloat(multiplier.replace('x', '')) || 1
}

function getActivityScore(chatter) {
  return Math.round(chatter.messages * getMultiplierValue(chatter.multiplier) + getWatchMinutes(chatter.watchTime) * 4)
}

function formatLeaderboardValue(value) {
  return typeof value === 'number' ? formatPlainInteger(value) : value
}

function LeaderboardList({ metricLabel, items, renderMetric, descriptorOffset = 0, t }) {
  return (
    <ol>
      {items.slice(0, 5).map((chatter, index) => (
        <li key={chatter.id ?? `${chatter.nickname}-${index}`}>
          <span className="leaderboard-rank">{index + 1}</span>
          <div>
            <strong>{chatter.nickname}</strong>
            <small>{chatter.note ?? t.chatterDescriptors[(index + descriptorOffset) % t.chatterDescriptors.length] ?? formatStatusLabel(chatter.status, t)}</small>
          </div>
          <em aria-label={metricLabel}>{renderMetric(chatter)}</em>
        </li>
      ))}
    </ol>
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
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab.id === tab.id}
              className={activeTab.id === tab.id ? 'is-active' : ''}
              onClick={() => setActiveTabId(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <LeaderboardList {...activeTab} />
    </MotionCard>
  )
}

function TopChatters({ chatters, chatAnalytics = null, language = 'ru', t }) {
  const byMessages = [...chatters].sort((first, second) => second.messages - first.messages)
  const byWatchTime = [...chatters].sort((first, second) => getWatchMinutes(second.watchTime) - getWatchMinutes(first.watchTime))
  const byActivity = [...chatters].sort((first, second) => getActivityScore(second) - getActivityScore(first))
  const byStreak = [...chatters].sort((first, second) => {
    const secondScore = getWatchMinutes(second.watchTime) + second.messages / 10
    const firstScore = getWatchMinutes(first.watchTime) + first.messages / 10
    return secondScore - firstScore
  })
  const totalMessages = chatAnalytics?.totalMessages ?? chatters.reduce((total, chatter) => total + chatter.messages, 0)
  const activeViewers = chatAnalytics?.activeNow ?? chatters.length
  const topMultiplier = chatAnalytics ? `x${chatAnalytics.activityPeak}` : byActivity[0]?.multiplier ?? 'x1.0'
  const messagesLeaderboard = chatAnalytics?.leaderboards.messages ?? byMessages
  const watchTimeLeaderboard = chatAnalytics?.leaderboards.watchTime ?? byWatchTime
  const tempoLeaderboard = chatAnalytics?.leaderboards.tempo ?? byActivity
  const engagementLeaderboard = chatAnalytics?.leaderboards.engagement ?? byStreak

  return (
    <Reveal as="section" className="section-panel top-chatters" id="chatters" aria-labelledby="top-chatters-title">
      <div className="section-heading">
        <div className="liquid-card hover-lift">
          <h2 id="top-chatters-title">{t.viewersAndChat}</h2>
        </div>
      </div>

      <div className="chat-summary-metrics" aria-label={t.viewersAndChat}>
        <div className="liquid-card hover-lift">
          <span>{t.activeNow}</span>
          <strong><AnimatedNumber value={activeViewers} format={formatPlainInteger} /></strong>
        </div>
        <div className="liquid-card hover-lift">
          <span>{t.streamMessages}</span>
          <strong><AnimatedNumber value={totalMessages} format={formatPlainInteger} /></strong>
        </div>
        <div>
          <span>{t.activityPeak}</span>
          <strong>{topMultiplier}</strong>
        </div>
      </div>

      <div className="chat-dashboard">
        <div className="chat-leaderboards chat-leaderboards-left">
          <TabbedLeaderboard
            title={t.topChatters}
            revealDelay={0.04}
            tabs={[
              { id: 'messages', label: t.messagesTab, metricLabel: t.messages, items: messagesLeaderboard, renderMetric: (chatter) => formatLeaderboardValue(chatAnalytics ? chatter.value : chatter.messages), descriptorOffset: 0, t },
              { id: 'watchTime', label: t.watchTimeTab, metricLabel: t.watchTime, items: watchTimeLeaderboard, renderMetric: (chatter) => chatAnalytics ? chatter.value : chatter.watchTime, descriptorOffset: 5, t },
            ]}
          />
        </div>

        <MotionCard as="article" className="console-rush-hub glass-panel liquid-card subtle-shine" revealDelay={0.1} aria-label="Console Rush">
          <ConsoleRush language={language} t={t} />
        </MotionCard>

        <div className="chat-leaderboards chat-leaderboards-right">
          <TabbedLeaderboard
            title={t.activityLeaderboardTitle}
            revealDelay={0.16}
            tabs={[
              { id: 'pace', label: t.paceTab, metricLabel: t.activity, items: tempoLeaderboard, renderMetric: (chatter) => chatAnalytics ? chatter.value : chatter.multiplier, descriptorOffset: 10, t },
              { id: 'engagement', label: t.engagementTab, metricLabel: t.watchTime, items: engagementLeaderboard, renderMetric: (chatter) => chatAnalytics ? chatter.value : `${Math.round(getWatchMinutes(chatter.watchTime) / 12)} ${t.activityPoints}`, descriptorOffset: 15, t },
            ]}
          />
        </div>
      </div>
    </Reveal>
  )
}

export default TopChatters
