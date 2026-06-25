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

function Leaderboard({ title, metricLabel, items, renderMetric, descriptorOffset = 0, t }) {
  return (
    <MotionCard as="article" className="chat-leaderboard glass-panel">
      <h3>{title}</h3>
      <ol>
        {items.slice(0, 5).map((chatter, index) => (
          <li key={chatter.id}>
            <span className="leaderboard-rank">{index + 1}</span>
            <div>
              <strong>{chatter.nickname}</strong>
              <small>{t.chatterDescriptors[(index + descriptorOffset) % t.chatterDescriptors.length] ?? formatStatusLabel(chatter.status, t)}</small>
            </div>
            <em aria-label={metricLabel}>{renderMetric(chatter)}</em>
          </li>
        ))}
      </ol>
    </MotionCard>
  )
}

function TopChatters({ chatters, language = 'ru', t }) {
  const byMessages = [...chatters].sort((first, second) => second.messages - first.messages)
  const byWatchTime = [...chatters].sort((first, second) => getWatchMinutes(second.watchTime) - getWatchMinutes(first.watchTime))
  const byActivity = [...chatters].sort((first, second) => getActivityScore(second) - getActivityScore(first))
  const byStreak = [...chatters].sort((first, second) => {
    const secondScore = getWatchMinutes(second.watchTime) + second.messages / 10
    const firstScore = getWatchMinutes(first.watchTime) + first.messages / 10
    return secondScore - firstScore
  })
  const totalMessages = chatters.reduce((total, chatter) => total + chatter.messages, 0)
  const activeViewers = chatters.length
  const topMultiplier = byActivity[0]?.multiplier ?? 'x1.0'

  return (
    <Reveal as="section" className="section-panel top-chatters" id="chatters" aria-labelledby="top-chatters-title">
      <div className="section-heading">
        <div>
          <h2 id="top-chatters-title">{t.viewersAndChat}</h2>
        </div>
      </div>

      <div className="chat-dashboard">
        <div className="chat-leaderboards chat-leaderboards-left">
          <Leaderboard title={t.messagesLeaderboard} metricLabel={t.messages} items={byMessages} renderMetric={(chatter) => formatPlainInteger(chatter.messages)} descriptorOffset={0} t={t} />
          <Leaderboard title={t.watchTimeLeaderboard} metricLabel={t.watchTime} items={byWatchTime} renderMetric={(chatter) => chatter.watchTime} descriptorOffset={5} t={t} />
        </div>

        <MotionCard as="article" className="console-rush-hub glass-panel" aria-label="Console Rush">
          <ConsoleRush language={language} t={t} />
          <div className="console-rush-metrics">
            <div>
              <span>{t.activeNow}</span>
              <strong><AnimatedNumber value={activeViewers} format={formatPlainInteger} /></strong>
            </div>
            <div>
              <span>{t.streamMessages}</span>
              <strong><AnimatedNumber value={totalMessages} format={formatPlainInteger} /></strong>
            </div>
            <div>
              <span>{t.activityPeak}</span>
              <strong>{topMultiplier}</strong>
            </div>
          </div>
        </MotionCard>

        <div className="chat-leaderboards chat-leaderboards-right">
          <Leaderboard title={t.activityLeaderboard} metricLabel={t.activity} items={byActivity} renderMetric={(chatter) => chatter.multiplier} descriptorOffset={10} t={t} />
          <Leaderboard title={t.streakLeaderboard} metricLabel={t.watchTime} items={byStreak} renderMetric={(chatter) => `${Math.round(getWatchMinutes(chatter.watchTime) / 12)} ${t.activityPoints}`} descriptorOffset={15} t={t} />
        </div>
      </div>
    </Reveal>
  )
}

export default TopChatters
