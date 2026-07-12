import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, test, vi } from 'vitest'

import SessionInsights from '../src/components/SessionInsights.jsx'
import TopChatters from '../src/components/TopChatters.jsx'
import { translations } from '../src/i18n/translations.js'
import {
  buildChatLeaderboards,
  buildInternalSessions,
  chooseDefaultSessionId,
  createReplayScheduler,
  createSessionCsv,
  createSessionReportHtml,
  getCompareSessionOptions,
  sessionExportFilename,
} from '../src/utils/sessionDashboard.js'

const archive = {
  streams: [
    { streamId: 'latest', title: 'Latest', date: '2026-07-10', categoryName: 'Chatting', status: 'completed', durationMinutes: 90, averageViewers: 20, peakViewers: 30, totalMessages: 40, uniqueChatters: 5, topWords: ['hello'] },
    { streamId: 'older', title: 'Older', date: '2026-07-01', categoryName: 'CS2', status: 'completed', durationMinutes: 60, averageViewers: 10, peakViewers: 15, totalMessages: 20, uniqueChatters: 3, topWords: ['round'] },
  ],
}

afterEach(() => vi.useRealTimers())

describe('restored session dashboard controls', () => {
  test('selects the live current session and falls back to the latest internal session offline', () => {
    const current = { streamId: 'live', title: 'Live', categoryName: 'Chatting', startedAt: '2026-07-12T10:00:00Z', points: [{ time: '10:00', viewers: 10, messagesPerMinute: 2 }], events: [] }
    const sessions = buildInternalSessions(archive, current, true)
    expect(chooseDefaultSessionId(sessions, 'live', true)).toBe('live')
    expect(chooseDefaultSessionId(buildInternalSessions(archive, null, false), null, false)).toBe('latest')
  })

  test('compare choices exclude the selected session and support compare off', () => {
    const sessions = buildInternalSessions(archive, null, false)
    expect(getCompareSessionOptions(sessions, 'latest').map((session) => session.id)).toEqual(['older'])
  })

  test('replay start is idempotent and stop clears its timer', () => {
    vi.useFakeTimers()
    const frames = []
    const replay = createReplayScheduler()
    const samples = [{ time: '10:00' }, { time: '10:01' }, { time: '10:02' }]
    expect(replay.start(samples, 2, (sample) => frames.push(sample.time))).toBe(true)
    expect(replay.start(samples, 2, () => undefined)).toBe(false)
    expect(vi.getTimerCount()).toBe(1)
    replay.stop()
    expect(vi.getTimerCount()).toBe(0)
    expect(frames).toEqual(['10:00'])
  })

  test('stopping replay during session change prevents old frames and allows the new session', async () => {
    vi.useFakeTimers()
    const frames = []
    const replay = createReplayScheduler()
    replay.start([{ time: 'old-1' }, { time: 'old-2' }], 1, (sample) => frames.push(sample.time))
    replay.stop()
    replay.start([{ time: 'new-1' }, { time: 'new-2' }], 10, (sample) => frames.push(sample.time))
    await vi.runAllTimersAsync()
    expect(frames).toEqual(['old-1', 'new-1', 'new-2'])
  })

  test('CSV export uses Twitch event data, escapes values, and creates a meaningful filename', () => {
    const session = { streamId: 'stream-1', sessionId: 'session-1', title: 'Title, "quoted"', date: '2026-07-12', category: 'Just Chatting', samples: [{ timestamp: '2026-07-12T10:00:00Z', viewers: 12, messagesPerMinute: 3 }] }
    expect(createSessionCsv(session)).toContain('"Title, ""quoted"""')
    expect(createSessionCsv(session)).toContain('"session-1"')
    expect(sessionExportFilename(session, 'csv')).toBe('2026-07-12-title-quoted.csv')
  })

  test('HTML report marks missing metrics as unavailable and escapes session text', () => {
    const html = createSessionReportHtml({ title: '<Unsafe>', date: null, samples: [], topChatters: [], topWords: [] }, 'Not available')
    expect(html).toContain('&lt;Unsafe&gt;')
    expect(html).toContain('Not available')
    expect(html).not.toContain('<Unsafe>')
    expect(html).not.toContain('undefined')
  })

  test('Messages, Time, Pace, and calculated Engagement derive only from observed chat data', () => {
    const data = buildChatLeaderboards({
      leaderboards: { messages: [{ nickname: 'real-user', value: 3 }] },
      recentMessages: [
        { nickname: 'real-user', time: '10:00' },
        { nickname: 'real-user', time: '10:05' },
        { nickname: 'real-user', time: '10:10' },
      ],
    })
    expect(data.messages[0]).toMatchObject({ nickname: 'real-user', value: 3 })
    expect(data.time[0]).toMatchObject({ nickname: 'real-user', value: 10 })
    expect(data.pace[0].value).toBeGreaterThan(0)
    expect(data.engagement[0]).toMatchObject({ nickname: 'real-user', calculated: true })
  })

  test('no-data and partial-failure states keep honest session content visible', () => {
    const empty = renderToStaticMarkup(createElement(SessionInsights, { session: null, ingestStatus: null, t: translations.en }))
    expect(empty).toContain(translations.en.sessionInsightsEmpty)
    const partial = renderToStaticMarkup(createElement(SessionInsights, {
      session: { title: 'Collected session', category: 'Chatting', status: 'completed', samples: [], events: [] },
      ingestStatus: null,
      error: new Error('request failed'),
      t: translations.en,
    }))
    expect(partial).toContain('Collected session')
    expect(partial).toContain(translations.en.sessionPartialData)
  })

  test('real chat section renders all restored tabs without demo content', () => {
    const markup = renderToStaticMarkup(createElement(TopChatters, {
      chatters: [],
      chatAnalytics: null,
      realDataMode: true,
      session: null,
      t: translations.en,
    }))
    for (const label of [translations.en.messagesTab, translations.en.watchTimeTab, translations.en.paceTab, translations.en.engagementTab]) expect(markup).toContain(label)
    expect(markup).not.toContain('Console Rush')
    expect(markup).not.toContain('viewer_')
  })
})
