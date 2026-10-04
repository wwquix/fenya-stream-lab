import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import ImportDataPanel from '../src/components/ImportDataPanel.jsx'
import StreamControlBar from '../src/components/StreamControlBar.jsx'
import { translations } from '../src/i18n/translations.js'

describe('server action availability', () => {
  test('offline static demo renders import inputs as disabled', () => {
    const markup = renderToStaticMarkup(createElement(ImportDataPanel, { t: translations.ru, apiAvailable: false }))
    expect(markup).toContain(translations.ru.serverActionsUnavailable)
    expect(markup).toMatch(/<textarea[^>]*disabled=""/)
    expect(markup).toMatch(/<input[^>]*disabled=""/)
  })

  test('read-only imports explain the required permission', () => {
    const markup = renderToStaticMarkup(createElement(ImportDataPanel, { t: translations.en, canImport: false }))
    expect(markup).toContain(translations.en.demoWritesRestricted)
    expect(markup).toMatch(/<textarea[^>]*disabled=""/)
  })

  test('offline control bar keeps CSV while disabling backend actions and avoiding a live claim', () => {
    const stream = { id: 'demo', title: 'Demo', category: 'CS2', summary: {}, chartData: [], categorySegments: [] }
    const markup = renderToStaticMarkup(createElement(StreamControlBar, {
      streams: [stream], selectedStreamId: 'demo', compareStreamId: '', onStreamChange: () => {}, onCompareChange: () => {},
      twitchMetadata: { metadata: { isLive: true } }, isTwitchMode: false, apiAvailable: false,
      theme: 'dark', onToggleTheme: () => {}, t: translations.ru,
      replay: { status: { isActive: false }, speed: 5, setSpeed: () => {}, error: null },
      streamSummary: { summary: {}, isLoading: false },
    }))
    expect(markup).toContain(translations.ru.staticDemoTitle)
    expect(markup).toContain('disabled="">Запустить повтор')
    expect(markup).toContain('disabled="">Создать отчёт')
    expect(markup).not.toContain('Скачать MD')
    expect(markup).not.toContain('live-pulse')
    expect(markup).toContain('CSV')
  })
})
