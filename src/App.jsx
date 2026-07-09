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
import ChannelOnboardingPanel from './components/ChannelOnboardingPanel.jsx'
import { RealDataEmptySection, RealDataSummary, RealModeNotice } from './components/RealModeStates.jsx'
import { currentStream, streams } from './data/mockStreams.js'
import { chatters } from './data/mockChatters.js'
import { moderators } from './data/mockModerators.js'
import { words } from './data/mockWords.js'
import { streamEvents } from './data/mockEvents.js'
import { adaptAnalyticsForStreamPulse, useStreamAnalytics } from './hooks/useStreamAnalytics.js'
import { useChatAnalytics } from './hooks/useChatAnalytics.js'
import { useTwitchMetadata } from './hooks/useTwitchMetadata.js'
import { useTwitchIngest } from './hooks/useTwitchIngest.js'
import { useWordAnalytics } from './hooks/useWordAnalytics.js'
import { useModerationAnalytics } from './hooks/useModerationAnalytics.js'
import { useStreamArchive } from './hooks/useStreamArchive.js'
import { useStreamSummary } from './hooks/useStreamSummary.js'
import { useReplay } from './hooks/useReplay.js'
import { useIdentity } from './hooks/useIdentity.js'
import { useTwitchVods } from './hooks/useTwitchVods.js'
import { useTwitchModerators } from './hooks/useTwitchModerators.js'
import { translations } from './i18n/translations.js'
import AppErrorState from './components/AppErrorState.jsx'
import { isBackendUnavailable, resolveDashboardPermissions, resolveInitialTheme } from './utils/dashboardUi.js'

const allSectionIds = ['top', 'pulse', 'chatters', 'words', 'moderators', 'archive', 'summary', 'import']

function App() {
  const [language, setLanguage] = useState(() => localStorage.getItem('fenya-language') || 'ru')
  const [theme, setTheme] = useState(() => {
    try {
      return resolveInitialTheme(localStorage.getItem('fenya-theme'))
    } catch {
      return 'dark'
    }
  })
  const [activeSection, setActiveSection] = useState('top')
  const [showBackToTop, setShowBackToTop] = useState(false)
  const [showSectionRail, setShowSectionRail] = useState(false)
  const [selectedStreamId, setSelectedStreamId] = useState(currentStream.id)
  const [compareStreamId, setCompareStreamId] = useState('')
  const [selectedChannel, setSelectedChannel] = useState(null)
  const selectedStream = streams.find((stream) => stream.id === selectedStreamId) ?? currentStream
  const compareStream = streams.find((stream) => stream.id === compareStreamId) ?? null
  const t = translations[language] ?? translations.ru
  const channelId = selectedChannel?.id ?? null
  const identity = useIdentity()
  const streamAnalytics = useStreamAnalytics({ channelId })
  const chatAnalytics = useChatAnalytics({ channelId })
  const twitchMetadata = useTwitchMetadata({ channelId })
  const twitchIngest = useTwitchIngest({ channelId })
  const wordAnalytics = useWordAnalytics({ channelId })
  const moderationAnalytics = useModerationAnalytics({ channelId })
  const streamArchive = useStreamArchive({ channelId })
  const streamSummary = useStreamSummary(selectedStream.id)
  const replay = useReplay(selectedStream.id)
  const dashboardMode = channelId ? 'connected-channel' : twitchIngest.connection?.provider === 'twitch' ? 'legacy-fenya' : 'mock'
  const isTwitchMode = dashboardMode !== 'mock'
  const isDataModeLoading = twitchIngest.isLoading && (channelId ? !twitchIngest.status : !twitchIngest.connection)
  const permissions = resolveDashboardPermissions({
    identity: identity.identity,
    dashboardMode,
    selectedChannel,
    legacyChannelLogin: twitchIngest.connection?.channelLogin,
  })
  const canManageChannel = permissions.canControlIngest
  const hasReadOnlyAccess = permissions.readOnly
  const twitchVods = useTwitchVods({ channelId, enabled: isTwitchMode })
  const twitchModerators = useTwitchModerators({ channelId, enabled: isTwitchMode })
  const backendUnavailable = isBackendUnavailable({
    identityError: identity.error,
    ingestError: twitchIngest.error,
    connection: twitchIngest.connection,
    status: twitchIngest.status,
  })
  const dashboardRequestFailed = isTwitchMode && Boolean(
    streamAnalytics.error
    || chatAnalytics.error
    || wordAnalytics.error
    || moderationAnalytics.error
    || streamArchive.error,
  )
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
  const backendPulseData = isTwitchMode
    ? adaptAnalyticsForStreamPulse(streamAnalytics.analytics, selectedStream)
    : replayAnalytics
      ? adaptAnalyticsForStreamPulse(replayAnalytics, selectedStream)
      : selectedStream.id === currentStream.id ? adaptAnalyticsForStreamPulse(streamAnalytics.analytics, selectedStream) : null
  const pulseStreamBase = backendPulseData?.stream ?? selectedStream
  const streamPulseStream = {
    ...pulseStreamBase,
    thumbnailUrl: twitchMetadata.metadata?.thumbnailUrl ?? pulseStreamBase.thumbnailUrl ?? null,
    isLive: twitchMetadata.metadata?.isLive ?? null,
  }
  const streamPulseEvents = backendPulseData?.events ?? streamEvents
  const hasRealStream = Boolean(streamAnalytics.analytics?.points?.length)
  const hasRealChat = Boolean(chatAnalytics.analytics?.leaderboards?.messages?.length)
  const hasRealWords = Boolean(wordAnalytics.analytics?.words?.length)
  const twitchConnected = Boolean(
    twitchIngest.connection?.appTokenAvailable
    && twitchIngest.connection?.userTokenValid
    && !twitchIngest.connection?.lastError,
  )
  const renderedSectionIds = useMemo(() => (
    backendUnavailable || isDataModeLoading
      ? ['top']
      : isTwitchMode
        ? allSectionIds.filter((id) => id !== 'import')
        : allSectionIds
  ), [backendUnavailable, isDataModeLoading, isTwitchMode])
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
    const sections = renderedSectionIds.map((id) => document.getElementById(id)).filter(Boolean)

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
      const hero = document.getElementById('top')
      setShowSectionRail(Boolean(hero && hero.getBoundingClientRect().bottom <= 0))
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', handleScroll)
    }
  }, [renderedSectionIds])

  function handleStreamChange(streamId) {
    setSelectedStreamId(streamId)
    setCompareStreamId((currentCompareId) => (currentCompareId === streamId ? '' : currentCompareId))
  }

  if (backendUnavailable) {
    return (
      <main className="app-shell app-error-shell">
        <AppErrorState title={t.backendUnavailableTitle} message={t.backendUnavailableMessage} actionLabel={t.retryRequest} onAction={() => window.location.reload()} />
      </main>
    )
  }

  return (
    <main className="app-shell">
      <Hero stream={selectedStream} activeSection={activeSection} language={language} onToggleLanguage={() => setLanguage((current) => (current === 'ru' ? 'en' : 'ru'))} t={t} />
      <SectionRail activeSection={activeSection} availableSectionIds={renderedSectionIds} isVisible={showSectionRail} t={t} />
      <BackToTop isVisible={showBackToTop} />

      <div className="content-grid" id="dashboard">
        <StreamControlBar
          streams={streams}
          selectedStreamId={selectedStreamId}
          compareStreamId={compareStreamId}
          onStreamChange={handleStreamChange}
          onCompareChange={setCompareStreamId}
          twitchMetadata={twitchMetadata}
          twitchIngest={twitchIngest}
          persistedMessageCount={chatAnalytics.analytics?.totalMessages ?? 0}
          isTwitchMode={isTwitchMode}
          dashboardMode={dashboardMode}
          canManageChannel={canManageChannel}
          readOnlyAccess={hasReadOnlyAccess}
          isDataModeLoading={isDataModeLoading}
          theme={theme}
          onToggleTheme={() => setTheme((currentTheme) => (currentTheme === 'light' ? 'dark' : 'light'))}
          replay={replay}
          streamSummary={streamSummary}
          t={t}
        />
        <ChannelOnboardingPanel
          t={t}
          identity={identity.identity}
          canConnectChannel={Boolean(identity.identity?.permissions?.canControlIngest)}
          permissions={permissions}
          dashboardMode={dashboardMode}
          onIdentityRefresh={identity.refresh}
          selectedChannel={selectedChannel}
          onOpenLegacy={() => {
            setSelectedChannel(null)
            document.getElementById('dashboard')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }}
          onOpenChannel={(channel) => {
            setSelectedChannel(channel)
            document.getElementById('dashboard')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }}
        />
        {dashboardRequestFailed ? (
          <AppErrorState compact title={t.apiRequestFailedTitle} message={t.apiRequestFailedMessage} actionLabel={t.retryRequest} onAction={() => window.location.reload()} />
        ) : null}
        {isDataModeLoading ? (
          <section className="real-data-empty glass-panel" role="status">
            <p>{t.loadingRealMode}</p>
          </section>
        ) : isTwitchMode ? (
          <>
            {dashboardMode === 'connected-channel' && !hasRealStream && !hasRealChat && !hasRealWords ? (
              <RealModeNotice title={t.modeConnectedChannel} note={t.channelNoDataNotice} />
            ) : twitchConnected && twitchMetadata.metadata?.isLive === false ? (
              <RealModeNotice title={t.offlineConnectedTitle} note={t.offlineConnectedNote} />
            ) : null}
            {hasRealStream ? (
              <StreamPulse stream={streamPulseStream} compareStream={null} events={backendPulseData?.events ?? []} t={t} />
            ) : (
              <RealDataEmptySection
                id="pulse"
                title={t.streamPulse}
                note={hasRealChat ? t.pulseChatOnly : t.pulseWaiting}
                minHeight="chart"
              />
            )}
            {hasRealChat ? (
              <TopChatters
                chatters={[]}
                chatAnalytics={chatAnalytics.analytics}
                language={language}
                realDataMode
                hasRealStream={hasRealStream}
                t={t}
              />
            ) : (
              <RealDataEmptySection id="chatters" title={t.viewersAndChat} note={dashboardMode === 'connected-channel' ? t.channelChatEmpty : t.noChatMessages} minHeight="large" />
            )}
            {hasRealWords ? (
              <WordMutationCloud
                words={[]}
                wordAnalytics={wordAnalytics.analytics}
                streamId={wordAnalytics.analytics.streamId}
                language={language}
                realDataMode
                t={t}
              />
            ) : (
              <RealDataEmptySection id="words" title={t.chatWordsTitle} note={t.noChatWords} minHeight="large" />
            )}
            <ModeratorUnit
              moderators={[]}
              events={[]}
              moderationAnalytics={moderationAnalytics.analytics}
              moderatorDirectory={twitchModerators}
              realDataMode
              canManageChannel={canManageChannel}
              t={t}
            />
            <StreamArchive streams={[]} archive={streamArchive.archive} selectedStreamId="" realDataMode vodArchive={twitchVods} canSyncVods={canManageChannel} dashboardMode={dashboardMode} t={t} />
            <RealDataSummary
              connection={twitchIngest.connection}
              ingestStatus={twitchIngest.status}
              metadata={twitchMetadata.metadata}
              chatAnalytics={chatAnalytics.analytics}
              wordAnalytics={wordAnalytics.analytics}
              vodArchive={twitchVods}
              dashboardMode={dashboardMode}
              channelLogin={selectedChannel?.twitchLogin}
              t={t}
            />
          </>
        ) : (
          <>
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
          </>
        )}
      </div>
    </main>
  )
}

export default App
