import { useEffect, useMemo, useState } from 'react'
import Hero from './components/Hero.jsx'
import SectionRail from './components/SectionRail.jsx'
import BackToTop from './components/BackToTop.jsx'
import StreamControlBar from './components/StreamControlBar.jsx'
import StreamPulse from './components/StreamPulse.jsx'
import TopChatters from './components/TopChatters.jsx'
import WordMutationCloud from './components/WordMutationCloud.jsx'
import ModeratorUnit from './components/ModeratorUnit.jsx'
import StreamArchive from './components/StreamArchive.jsx'
import DashboardOverview from './components/DashboardOverview.jsx'
import ImportDataPanel from './components/ImportDataPanel.jsx'
import { currentStream, streams } from './data/mockStreams.js'
import { chatters } from './data/mockChatters.js'
import { moderators } from './data/mockModerators.js'
import { words } from './data/mockWords.js'
import { streamEvents } from './data/mockEvents.js'
import { adaptAnalyticsForStreamPulse, useStreamAnalytics } from './hooks/useStreamAnalytics.js'
import { useChatAnalytics } from './hooks/useChatAnalytics.js'
import { useTwitchMetadata } from './hooks/useTwitchMetadata.js'
import { useWordAnalytics } from './hooks/useWordAnalytics.js'
import { useModerationAnalytics } from './hooks/useModerationAnalytics.js'
import { useStreamArchive } from './hooks/useStreamArchive.js'
import { useStreamSummary } from './hooks/useStreamSummary.js'
import { useReplay } from './hooks/useReplay.js'
import { translations } from './i18n/translations.js'

const sectionIds = ['hero', 'stream-pulse', 'chatters', 'speech', 'moderators', 'archive', 'summary', 'import-data']

function App() {
  const [language, setLanguage] = useState(() => localStorage.getItem('fenya-language') || 'ru')
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('fenya-theme') === 'dark' ? 'dark' : 'light'
    } catch {
      return 'light'
    }
  })
  const [activeSection, setActiveSection] = useState('hero')
  const [showBackToTop, setShowBackToTop] = useState(false)
  const [showSectionRail, setShowSectionRail] = useState(false)
  const [selectedStreamId, setSelectedStreamId] = useState(currentStream.id)
  const [compareStreamId, setCompareStreamId] = useState('')
  const selectedStream = streams.find((stream) => stream.id === selectedStreamId) ?? currentStream
  const compareStream = streams.find((stream) => stream.id === compareStreamId) ?? null
  const t = translations[language] ?? translations.ru
  const streamAnalytics = useStreamAnalytics()
  const chatAnalytics = useChatAnalytics()
  const twitchMetadata = useTwitchMetadata()
  const wordAnalytics = useWordAnalytics()
  const moderationAnalytics = useModerationAnalytics()
  const streamArchive = useStreamArchive()
  const streamSummary = useStreamSummary(selectedStream.id)
  const replay = useReplay(selectedStream.id)
  const replayAnalytics = useMemo(() => {
    if (!replay.data.viewerSamples.length) return null
    return {
      streamId: selectedStream.id,
      title: selectedStream.title,
      categoryName: selectedStream.category,
      startedAt: null,
      points: replay.data.viewerSamples.map((point) => ({ time: point.time, viewers: point.viewers, messagesPerMinute: point.messagesPerMinute })),
      segments: selectedStream.categorySegments.map((segment) => ({ start: segment.start, end: segment.end, label: segment.category })),
      events: replay.data.markers.map((marker) => ({ time: marker.time, label: marker.label, category: marker.category, type: marker.markerType, viewers: marker.viewers, messagesPerMinute: marker.messagesPerMinute })),
    }
  }, [replay.data.viewerSamples, replay.data.markers, selectedStream])
  const backendPulseData = replayAnalytics
    ? adaptAnalyticsForStreamPulse(replayAnalytics, selectedStream)
    : selectedStream.id === currentStream.id ? adaptAnalyticsForStreamPulse(streamAnalytics.analytics, selectedStream) : null
  const streamPulseStream = backendPulseData?.stream ?? selectedStream
  const streamPulseEvents = backendPulseData?.events ?? streamEvents
  const replayChatAnalytics = useMemo(() => {
    if (!replay.data.chatMessages.length) return null
    const counts = new Map()
    replay.data.chatMessages.forEach((message) => counts.set(message.nickname, (counts.get(message.nickname) ?? 0) + 1))
    const messages = [...counts.entries()].map(([nickname, value]) => ({ nickname, value, note: t.replayRunning })).sort((a, b) => b.value - a.value)
    const fallback = chatters.map((chatter) => ({ nickname: chatter.nickname, value: chatter.watchTime, note: chatter.status }))
    return {
      totalMessages: replay.data.chatMessages.length,
      activeNow: counts.size,
      activityPeak: Math.min(10, Math.max(1, counts.size)),
      leaderboards: {
        messages,
        watchTime: fallback,
        tempo: fallback.map((item) => ({ ...item, value: `${counts.get(item.nickname) ?? 0}/min` })),
        engagement: fallback,
      },
    }
  }, [replay.data.chatMessages, t.replayRunning])
  const replayModerationAnalytics = useMemo(() => {
    if (!replay.data.moderationActions.length) return null
    const base = moderationAnalytics.analytics
    if (!base) return null
    const extraActions = replay.data.moderationActions.reduce((sum, action) => sum + (action.actions ?? 1), 0)
    return {
      ...base,
      summary: { ...base.summary, totalActions: extraActions },
      moderators: base.moderators.map((moderator, index) => index === 0 ? { ...moderator, actions: extraActions } : moderator),
      events: replay.data.moderationActions.map((action) => ({ time: action.time, label: action.label, actions: action.actions, type: action.actionType, note: action.note })),
    }
  }, [replay.data.moderationActions, moderationAnalytics.analytics])
  useEffect(() => {
    localStorage.setItem('fenya-language', language)
    document.documentElement.lang = language
  }, [language])

  useEffect(() => {
    document.documentElement.dataset.theme = theme

    try {
      localStorage.setItem('fenya-theme', theme)
    } catch {
      // The selected theme still applies when storage is unavailable.
    }
  }, [theme])

  useEffect(() => {
    const sections = sectionIds.map((id) => document.getElementById(id)).filter(Boolean)

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort((first, second) => second.intersectionRatio - first.intersectionRatio)[0]

        if (visibleEntry) {
          setActiveSection(visibleEntry.target.id)
        }
      },
      {
        rootMargin: '-22% 0px -58% 0px',
        threshold: [0.1, 0.25, 0.5, 0.75],
      },
    )

    sections.forEach((section) => observer.observe(section))

    function handleScroll() {
      setShowBackToTop(window.scrollY > window.innerHeight * 0.65)
      const hero = document.getElementById('hero')
      setShowSectionRail(Boolean(hero && hero.getBoundingClientRect().bottom <= 0))
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])

  function handleStreamChange(streamId) {
    setSelectedStreamId(streamId)
    setCompareStreamId((currentCompareId) => (currentCompareId === streamId ? '' : currentCompareId))
  }

  return (
    <main className="app-shell">
      <Hero stream={selectedStream} activeSection={activeSection} language={language} onToggleLanguage={() => setLanguage((current) => (current === 'ru' ? 'en' : 'ru'))} t={t} />
      <SectionRail activeSection={activeSection} isVisible={showSectionRail} t={t} />
      <BackToTop isVisible={showBackToTop} />

      <div className="content-grid" id="dashboard">
        <StreamControlBar
          streams={streams}
          selectedStreamId={selectedStreamId}
          compareStreamId={compareStreamId}
          onStreamChange={handleStreamChange}
          onCompareChange={setCompareStreamId}
          twitchMetadata={twitchMetadata}
          theme={theme}
          onToggleTheme={() => setTheme((currentTheme) => (currentTheme === 'light' ? 'dark' : 'light'))}
          replay={replay}
          streamSummary={streamSummary}
          t={t}
        />
        <StreamPulse stream={streamPulseStream} compareStream={compareStream} events={streamPulseEvents} t={t} />
        {/* Data map is reserved for a future real data pipeline view. */}
        <TopChatters
          chatters={chatters}
          chatAnalytics={replayChatAnalytics ?? (selectedStream.id === currentStream.id ? chatAnalytics.analytics : null)}
          language={language}
          t={t}
        />
        <WordMutationCloud
          words={words}
          wordAnalytics={selectedStream.id === currentStream.id ? wordAnalytics.analytics : null}
          streamId={selectedStream.id}
          language={language}
          t={t}
        />
        <ModeratorUnit
          moderators={moderators}
          events={streamEvents}
          moderationAnalytics={replayModerationAnalytics ?? (selectedStream.id === currentStream.id ? moderationAnalytics.analytics : null)}
          t={t}
        />
        <StreamArchive streams={streams} archive={streamArchive.archive} selectedStreamId={selectedStream.id} t={t} />
        <DashboardOverview
          stream={selectedStream}
          moderators={moderators}
          events={streamEvents}
          chatters={chatters}
          streamSummary={streamSummary.summary}
          t={t}
        />
        <ImportDataPanel t={t} />
      </div>
    </main>
  )
}

export default App
