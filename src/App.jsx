import { useEffect, useState } from 'react'
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
import { currentStream, streams } from './data/mockStreams.js'
import { chatters } from './data/mockChatters.js'
import { moderators } from './data/mockModerators.js'
import { words } from './data/mockWords.js'
import { streamEvents } from './data/mockEvents.js'
import { adaptAnalyticsForStreamPulse, useStreamAnalytics } from './hooks/useStreamAnalytics.js'
import { useTwitchMetadata } from './hooks/useTwitchMetadata.js'
import { translations } from './i18n/translations.js'

const sectionIds = ['hero', 'stream-pulse', 'chatters', 'speech', 'moderators', 'archive', 'summary']

function App() {
  const [language, setLanguage] = useState(() => localStorage.getItem('fenya-language') || 'ru')
  const [activeSection, setActiveSection] = useState('hero')
  const [showBackToTop, setShowBackToTop] = useState(false)
  const [showSectionRail, setShowSectionRail] = useState(false)
  const [selectedStreamId, setSelectedStreamId] = useState(currentStream.id)
  const [compareStreamId, setCompareStreamId] = useState('')
  const selectedStream = streams.find((stream) => stream.id === selectedStreamId) ?? currentStream
  const compareStream = streams.find((stream) => stream.id === compareStreamId) ?? null
  const streamAnalytics = useStreamAnalytics()
  const twitchMetadata = useTwitchMetadata()
  const backendPulseData = selectedStream.id === currentStream.id ? adaptAnalyticsForStreamPulse(streamAnalytics.analytics, selectedStream) : null
  const streamPulseStream = backendPulseData?.stream ?? selectedStream
  const streamPulseEvents = backendPulseData?.events ?? streamEvents
  const t = translations[language] ?? translations.ru

  useEffect(() => {
    localStorage.setItem('fenya-language', language)
    document.documentElement.lang = language
  }, [language])

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
          t={t}
        />
        <StreamPulse stream={streamPulseStream} compareStream={compareStream} events={streamPulseEvents} t={t} />
        {/* Data map is reserved for a future real data pipeline view. */}
        <TopChatters chatters={chatters} language={language} t={t} />
        <WordMutationCloud words={words} streamId={selectedStream.id} language={language} t={t} />
        <ModeratorUnit moderators={moderators} events={streamEvents} t={t} />
        <StreamArchive streams={streams} selectedStreamId={selectedStream.id} t={t} />
        <DashboardOverview stream={selectedStream} moderators={moderators} events={streamEvents} chatters={chatters} t={t} />
      </div>
    </main>
  )
}

export default App
