import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Hero from './components/Hero.jsx'
import SectionRail from './components/SectionRail.jsx'
import BackToTop from './components/BackToTop.jsx'
import StreamControlBar from './components/StreamControlBar.jsx'
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
import { useClientReplay } from './hooks/useClientReplay.js'
import { useSessionReport } from './hooks/useSessionReport.js'
import { useIdentity } from './hooks/useIdentity.js'
import { useTwitchVods } from './hooks/useTwitchVods.js'
import { useTwitchModerators } from './hooks/useTwitchModerators.js'
import { useAdvancedAnalytics } from './hooks/useAdvancedAnalytics.js'
import { useLiquidPointer } from './hooks/useLiquidPointer.js'
import { translations } from './i18n/translations.js'
import AppErrorState from './components/AppErrorState.jsx'
import { isBackendUnavailable, resolveDashboardPermissions, resolveInitialTheme } from './utils/dashboardUi.js'
import { buildInternalSessions, chooseDefaultSessionId, mergeSessionData } from './utils/sessionDashboard.js'
import SettingsPanel from './components/SettingsPanel.jsx'

const allSectionIds = ['top', 'summary', 'pulse', 'insights', 'chatters', 'words', 'moderators', 'archive', 'import']
const StreamPulse = lazy(() => import('./components/StreamPulse.jsx'))
const AdvancedInsights = lazy(() => import('./components/AdvancedInsights.jsx'))

function StreamPulseFallback({ t }) {
  return (
    <section className="real-data-empty liquid-glass liquid-surface" id="pulse" role="status">
      <p>{t.loadingMetadata}</p>
    </section>
  )
}

function AdvancedInsightsFallback({ t, id = 'insights' }) {
  return (
    <section className="real-data-empty liquid-glass liquid-surface" id={id} role="status">
      <p>{t.advancedLoading}</p>
    </section>
  )
}

function SectionGroupHeader({ title }) {
  return (
    <header className="section-group-header">
      <h2>{title}</h2>
    </header>
  )
}

function adaptSessionToPulse(session, fallbackStream) {
  if (!session?.samples?.length) return null
  return {
    ...fallbackStream,
    id: session.streamId,
    title: session.title,
    category: session.category,
    categorySegments: [],
    chartData: session.samples.map((sample) => ({
      time: sample.time,
      viewers: sample.viewers,
      chatMessagesPerMinute: sample.messagesPerMinute,
      category: session.category,
      previewLabel: session.title,
    })),
  }
}

function App() {
  useLiquidPointer()
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
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [selectedStreamId, setSelectedStreamId] = useState(currentStream.id)
  const [compareStreamId, setCompareStreamId] = useState('')
  const [selectedChannel, setSelectedChannel] = useState(null)
  const settingsTriggerRef = useRef(null)
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
  const dashboardMode = channelId ? 'connected-channel' : twitchIngest.connection?.provider === 'twitch' ? 'legacy-fenya' : 'mock'
  const isTwitchMode = dashboardMode !== 'mock'
  const streamSummary = useStreamSummary(selectedStream.id, { enabled: !isTwitchMode })
  const replay = useReplay(selectedStream.id, { enabled: !isTwitchMode })
  const internalSessions = useMemo(() => buildInternalSessions(
    streamArchive.archive,
    streamAnalytics.analytics,
    twitchMetadata.metadata?.isLive === true,
  ), [streamArchive.archive, streamAnalytics.analytics, twitchMetadata.metadata?.isLive])
  const defaultInternalSessionId = chooseDefaultSessionId(internalSessions, streamAnalytics.analytics?.streamId, twitchMetadata.metadata?.isLive === true)
  const activeSelectedStreamId = isTwitchMode && !internalSessions.some((session) => session.id === selectedStreamId)
    ? defaultInternalSessionId
    : selectedStreamId
  const activeCompareStreamId = compareStreamId !== activeSelectedStreamId && internalSessions.some((session) => session.id === compareStreamId)
    ? compareStreamId
    : ''
  const selectedInternalBase = internalSessions.find((session) => session.id === activeSelectedStreamId) ?? null
  const compareInternalBase = internalSessions.find((session) => session.id === activeCompareStreamId) ?? null
  const selectedSessionReport = useSessionReport(selectedInternalBase?.id, isTwitchMode)
  const compareSessionReport = useSessionReport(compareInternalBase?.id, isTwitchMode && Boolean(compareStreamId))
  const currentStreamId = streamAnalytics.analytics?.streamId
  const selectedIsCurrent = Boolean(selectedInternalBase?.id && selectedInternalBase.id === currentStreamId)
  const selectedSession = useMemo(() => mergeSessionData(selectedInternalBase, selectedSessionReport.report, selectedIsCurrent ? {
    samples: streamAnalytics.analytics?.points,
    events: streamAnalytics.analytics?.events,
    totalMessages: chatAnalytics.analytics?.totalMessages,
    uniqueChatters: chatAnalytics.analytics?.activeNow,
    activityPeak: chatAnalytics.analytics?.activityPeak,
    topChatters: chatAnalytics.analytics?.leaderboards?.messages,
    topWords: wordAnalytics.analytics?.words,
  } : {}), [selectedInternalBase, selectedSessionReport.report, selectedIsCurrent, streamAnalytics.analytics, chatAnalytics.analytics, wordAnalytics.analytics])
  const compareSession = useMemo(() => mergeSessionData(compareInternalBase, compareSessionReport.report), [compareInternalBase, compareSessionReport.report])
  const clientReplay = useClientReplay(selectedSession?.samples ?? [], selectedInternalBase?.id)
  const isDataModeLoading = twitchIngest.isLoading && (channelId ? !twitchIngest.status : !twitchIngest.connection)
  const advancedStreamId = isTwitchMode ? selectedInternalBase?.id ?? null : selectedStream.id
  const advancedAnalytics = useAdvancedAnalytics({
    streamId: advancedStreamId,
    dashboardMode,
    channelId,
    enabled: !isDataModeLoading && Boolean(advancedStreamId),
  })
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
  const replayedSelectedSession = selectedSession ? { ...selectedSession, samples: clientReplay.visibleSamples } : null
  const realPulseStream = adaptSessionToPulse(replayedSelectedSession, selectedStream)
  const realCompareStream = adaptSessionToPulse(compareSession, selectedStream)
  const hasRealStream = Boolean(realPulseStream?.chartData?.length)
  const hasRealChat = Boolean(chatAnalytics.analytics?.leaderboards?.messages?.length)
  const hasRealWords = Boolean(wordAnalytics.analytics?.words?.length)
  const twitchConnected = Boolean(
    twitchIngest.connection?.channelFound
    && twitchIngest.connection?.ingestAccountFound
    && !twitchIngest.connection?.needsReauth,
  )
  const renderedSectionIds = useMemo(() => (
    backendUnavailable || isDataModeLoading
      ? ['top']
      : allSectionIds
  ), [backendUnavailable, isDataModeLoading])
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

  const closeSettings = useCallback(() => {
    setSettingsOpen(false)
    window.requestAnimationFrame(() => settingsTriggerRef.current?.focus())
  }, [])

  function openLegacyDashboard() {
    setSelectedChannel(null)
    closeSettings()
    window.requestAnimationFrame(() => document.getElementById('dashboard')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  function openChannelDashboard(channel) {
    setSelectedChannel(channel)
    closeSettings()
    window.requestAnimationFrame(() => document.getElementById('dashboard')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
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
      <Hero
        stream={selectedStream}
        activeSection={activeSection}
        language={language}
        onToggleLanguage={() => setLanguage((current) => (current === 'ru' ? 'en' : 'ru'))}
        onOpenSettings={() => setSettingsOpen(true)}
        settingsOpen={settingsOpen}
        settingsTriggerRef={settingsTriggerRef}
        t={t}
      />
      <SectionRail activeSection={activeSection} availableSectionIds={renderedSectionIds} isVisible={showSectionRail} t={t} />
      <BackToTop isVisible={showBackToTop} />
      {settingsOpen ? (
        <SettingsPanel theme={theme} onToggleTheme={() => setTheme((currentTheme) => (currentTheme === 'light' ? 'dark' : 'light'))} onClose={closeSettings} t={t}>
          <ChannelOnboardingPanel
            t={t}
            identity={identity.identity}
            canConnectChannel={Boolean(identity.identity?.permissions?.canControlIngest)}
            permissions={permissions}
            dashboardMode={dashboardMode}
            onIdentityRefresh={identity.refresh}
            selectedChannel={selectedChannel}
            legacyChannelLogin={twitchIngest.connection?.channelLogin || 'fenya'}
            onOpenLegacy={openLegacyDashboard}
            onOpenChannel={openChannelDashboard}
          />
        </SettingsPanel>
      ) : null}

      <div className="content-grid" id="dashboard">
        <SectionGroupHeader kicker={t.overviewGroupKicker} title={t.overviewGroupTitle} note={t.overviewGroupNote} />
        <StreamControlBar
          streams={streams}
          internalSessions={internalSessions}
          selectedSession={selectedSession}
          selectedStreamId={isTwitchMode ? activeSelectedStreamId : selectedStreamId}
          compareStreamId={isTwitchMode ? activeCompareStreamId : compareStreamId}
          onStreamChange={handleStreamChange}
          onCompareChange={setCompareStreamId}
          twitchMetadata={twitchMetadata}
          twitchIngest={twitchIngest}
          persistedMessageCount={chatAnalytics.analytics?.totalMessages ?? null}
          isTwitchMode={isTwitchMode}
          dashboardMode={dashboardMode}
          canManageChannel={canManageChannel}
          readOnlyAccess={hasReadOnlyAccess}
          isDataModeLoading={isDataModeLoading}
          sessionDataLoading={selectedSessionReport.isLoading}
          replay={isTwitchMode ? clientReplay : replay}
          streamSummary={streamSummary}
          t={t}
        />
        {dashboardRequestFailed ? (
          <AppErrorState compact title={t.apiRequestFailedTitle} message={t.apiRequestFailedMessage} actionLabel={t.retryRequest} onAction={() => window.location.reload()} />
        ) : null}
        {isDataModeLoading ? (
          <section className="real-data-empty liquid-glass liquid-surface" role="status">
            <p>{t.loadingRealMode}</p>
          </section>
        ) : isTwitchMode ? (
          <>
            {dashboardMode === 'connected-channel' && !hasRealStream && !hasRealChat && !hasRealWords ? (
              <RealModeNotice title={t.modeConnectedChannel} note={t.channelNoDataNotice} variant="warning" />
            ) : twitchConnected && twitchMetadata.metadata?.isLive === false ? (
              <RealModeNotice title={t.offlineConnectedTitle} note={t.offlineConnectedNote} variant="info" />
            ) : null}
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
            {hasRealStream ? (
              <Suspense fallback={<StreamPulseFallback t={t} />}>
                <StreamPulse stream={realPulseStream} compareStream={realCompareStream} events={selectedSession?.events ?? []} t={t} />
              </Suspense>
            ) : (
              <RealDataEmptySection
                id="pulse"
                title={t.streamPulse}
                note={hasRealChat ? t.pulseChatOnly : t.pulseWaiting}
                minHeight="chart"
              />
            )}
            <SectionGroupHeader kicker={t.audienceGroupKicker} title={t.audienceGroupTitle} note={t.audienceGroupNote} />
            <Suspense fallback={<AdvancedInsightsFallback t={t} />}>
              <AdvancedInsights
                data={advancedAnalytics.data}
                isLoading={advancedAnalytics.isLoading}
                error={advancedAnalytics.error}
                onRetry={advancedAnalytics.retry}
                streamId={advancedStreamId}
                language={language}
                t={t}
              />
            </Suspense>
            <TopChatters
              chatters={[]}
              chatAnalytics={selectedIsCurrent ? chatAnalytics.analytics : selectedSession?.topChatters?.length ? {
                totalMessages: selectedSession.totalMessages ?? null,
                activeNow: selectedSession.uniqueChatters ?? null,
                activityPeak: selectedSession.activityPeak ?? null,
                leaderboards: { messages: selectedSession.topChatters.map((item) => ({ nickname: item.nickname, value: item.messages ?? item.value ?? 0 })) },
                recentMessages: [],
              } : null}
              realDataMode
              session={selectedSession}
              ingestStatus={twitchIngest.status}
              error={chatAnalytics.error || selectedSessionReport.error}
              t={t}
            />
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
            <SectionGroupHeader kicker={t.archiveGroupKicker} title={t.archiveGroupTitle} note={t.archiveGroupNote} />
            <StreamArchive streams={[]} archive={streamArchive.archive} selectedStreamId={activeSelectedStreamId.startsWith('stream-') ? activeSelectedStreamId : `stream-${activeSelectedStreamId}`} realDataMode vodArchive={twitchVods} canSyncVods={canManageChannel} dashboardMode={dashboardMode} t={t} />
          </>
        ) : (
          <>
            <DashboardOverview
              stream={selectedStream}
              moderators={moderators}
              events={streamEvents}
              chatters={chatters}
              streamSummary={streamSummary.summary}
              t={t}
            />
            <Suspense fallback={<StreamPulseFallback t={t} />}>
              <StreamPulse stream={streamPulseStream} compareStream={compareStream} events={streamPulseEvents} t={t} />
            </Suspense>
            <SectionGroupHeader kicker={t.audienceGroupKicker} title={t.audienceGroupTitle} note={t.audienceGroupNote} />
            <Suspense fallback={<AdvancedInsightsFallback t={t} />}>
              <AdvancedInsights
                data={advancedAnalytics.data}
                isLoading={advancedAnalytics.isLoading}
                error={advancedAnalytics.error}
                onRetry={advancedAnalytics.retry}
                streamId={advancedStreamId}
                language={language}
                t={t}
              />
            </Suspense>
            {/* Data map is reserved for a future real data pipeline view. */}
            <TopChatters
              chatters={chatters}
              chatAnalytics={replayChatAnalytics ?? (selectedStream.id === currentStream.id ? chatAnalytics.analytics : null)}
              session={{
                ...selectedStream,
                streamId: selectedStream.id,
                durationMinutes: selectedStream.summary?.durationMinutes,
                averageViewers: selectedStream.summary?.averageViewers,
                peakViewers: selectedStream.summary?.peakViewers,
                totalMessages: selectedStream.metrics?.chatMessages,
                uniqueChatters: selectedStream.metrics?.activeChatters,
                activityPeak: null,
                samples: selectedStream.chartData?.map((point) => ({ time: point.time, viewers: point.viewers, messagesPerMinute: point.chatMessagesPerMinute })) ?? [],
                events: streamEvents,
              }}
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
            <SectionGroupHeader kicker={t.archiveGroupKicker} title={t.archiveGroupTitle} note={t.archiveGroupNote} />
            <StreamArchive streams={streams} archive={streamArchive.archive} selectedStreamId={selectedStream.id} t={t} />
          </>
        )}
        <ImportDataPanel t={t} />
      </div>
    </main>
  )
}

export default App
