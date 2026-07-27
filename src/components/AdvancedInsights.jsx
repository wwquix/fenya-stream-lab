import { useId, useRef, useState } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Reveal } from './MotionPrimitives.jsx'
import { MetricCard, SegmentedControl, StatusBanner } from './UiPrimitives.jsx'
import '../styles/advancedInsights.css'

const TAB_DEFINITIONS = [
  { id: 'loyalty', labelKey: 'advancedLoyaltyTab' },
  { id: 'clips', labelKey: 'advancedClipsTab' },
  { id: 'events', labelKey: 'advancedEventsTab' },
  { id: 'retention', labelKey: 'advancedRetentionTab' },
]

function localeFor(language) {
  return language === 'en' ? 'en-US' : 'ru-RU'
}

function formatNumber(value, language, maximumFractionDigits = 0) {
  if (value === null || value === undefined || value === '') return null
  if (!Number.isFinite(Number(value))) return null
  return new Intl.NumberFormat(localeFor(language), { maximumFractionDigits }).format(Number(value))
}

function toPercent(value, isRatio = false) {
  if (value === null || value === undefined || value === '') return null
  if (!Number.isFinite(Number(value))) return null
  const number = Number(value)
  return isRatio ? number * 100 : number
}

function formatPercent(value, language, signed = false, isRatio = false) {
  const percent = toPercent(value, isRatio)
  if (percent === null) return null
  const formatted = new Intl.NumberFormat(localeFor(language), {
    maximumFractionDigits: 1,
    signDisplay: signed ? 'exceptZero' : 'auto',
  }).format(percent)
  return `${formatted}%`
}

function formatDateTime(value, language) {
  if (!value) return null
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return value
  return new Intl.DateTimeFormat(localeFor(language), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(timestamp)
}

function formatTimelineValue(value, language) {
  if (!value) return null
  if (!value.includes('T')) return value
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return value
  return new Intl.DateTimeFormat(localeFor(language), {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'UTC',
  }).format(timestamp)
}

function localizedText(value, language, fallback) {
  if (!value || typeof value !== 'object') return fallback
  return value[language] ?? value.ru ?? value.en ?? fallback
}

function mappedLabel(map, value, fallback) {
  if (!value) return fallback
  return map?.[value] ?? fallback
}

function formatConfidence(value, language, t) {
  if (typeof value === 'number') return formatPercent(value, language, false, true) ?? t.notAvailable
  return mappedLabel(t.advancedConfidenceLabels, value, t.advancedUnknownValue)
}

function formatScore(value, language, t) {
  return formatNumber(value, language, 2) ?? t.notAvailable
}

function formatMetric(value, language, t, maximumFractionDigits = 0) {
  return formatNumber(value, language, maximumFractionDigits) ?? t.notAvailable
}

function formatMetricPercent(value, language, t, signed = false, isRatio = false) {
  return formatPercent(value, language, signed, isRatio) ?? t.notAvailable
}

function formatMinutes(value, language, t, lowerBound = false) {
  const formatted = formatNumber(value, language, 1)
  if (formatted === null) return t.notAvailable
  return `${lowerBound ? '≥ ' : ''}${formatted} ${t.minutesShort}`
}

function formatTimeRange(startTime, endTime, language, t) {
  const start = formatTimelineValue(startTime, language)
  const end = formatTimelineValue(endTime, language)
  if (start && end) return `${start}–${end}`
  return start ?? end ?? t.notAvailable
}

function relatedItemLabel(item, language, t) {
  if (typeof item === 'string') return item
  if (!item) return t.notAvailable
  const label = item.label ?? mappedLabel(t.advancedEventTypeLabels, item.type, null)
  const range = formatTimeRange(item.startTime ?? item.time, item.endTime, language, t)
  return label ? `${range} · ${label}` : range
}

function segmentLabel(segment, language, t) {
  if (!segment) return t.notAvailable
  const text = localizedText(segment.text, language, null)
  const range = formatTimeRange(segment.startTime, segment.endTime, language, t)
  if (text) return `${range} · ${text}`
  if (segment.label) return `${range} · ${segment.label}`
  return range
}

function StatePanel({ message, role = 'status', actionLabel = null, onAction = null }) {
  return (
    <StatusBanner
      className="advanced-insights-state"
      variant={role === 'alert' ? 'error' : 'info'}
      action={actionLabel && onAction ? (
        <button className="button button-secondary" type="button" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    >
      {message}
    </StatusBanner>
  )
}

function DataQualityBlock({ data, language, t, headingId }) {
  const quality = data.dataQuality
  const statusLabel = mappedLabel(t.advancedQualityLabels, quality.status, t.advancedUnknownValue)
  const metrics = [
    [t.advancedViewerSamples, quality.viewerSamples],
    [t.advancedMessages, quality.messages],
    [t.advancedUniqueChatters, quality.uniqueChatters],
    [t.advancedMarkers, quality.markers],
    [t.advancedHistoricalStreams, quality.historicalStreams],
  ]
  const warnings = quality.warnings.map((warning) => (
    mappedLabel(t.advancedWarningLabels, warning, t.advancedUnknownWarning)
  ))

  return (
    <section className={`advanced-quality is-${quality.status}`} aria-labelledby={headingId}>
      <p className="advanced-quality-summary" id={headingId}>
        <strong>{t.advancedDataQuality}: {statusLabel}</strong>
        <span>{formatMetric(quality.viewerSamples, language, t)} {t.advancedViewerSamples.toLocaleLowerCase()}</span>
        <span>{formatMetric(quality.messages, language, t)} {t.advancedMessages.toLocaleLowerCase()}</span>
        <span>{formatMetric(quality.uniqueChatters, language, t)} {t.advancedUniqueChatters.toLocaleLowerCase()}</span>
      </p>
      <details className="methodology-details advanced-quality-details">
        <summary>{t.advancedDataDetails}</summary>
        <dl className="advanced-quality-grid">
          {metrics.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{formatMetric(value, language, t)}</dd>
            </div>
          ))}
          <div>
            <dt>{t.advancedAbsoluteTimestamps}</dt>
            <dd>{quality.hasAbsoluteTimestamps === null ? t.notAvailable : quality.hasAbsoluteTimestamps ? t.yes : t.no}</dd>
          </div>
          <div>
            <dt>{t.advancedDataSource}</dt>
            <dd>{mappedLabel(t.advancedSourceLabels, data.source, t.advancedUnknownValue)}</dd>
          </div>
          <div>
            <dt>{t.advancedGeneratedAt}</dt>
            <dd>{formatDateTime(data.generatedAt, language) ?? t.notAvailable}</dd>
          </div>
        </dl>
        {quality.collectedFrom ? (
          <p className="advanced-quality-note">
            <strong>{t.advancedCollectedFrom}</strong>{' '}
            <span>{formatDateTime(quality.collectedFrom, language)}</span>
          </p>
        ) : null}
        {quality.collectedPeriodOnly ? <p className="advanced-quality-note">{t.advancedCollectedPeriodOnly}</p> : null}
        {warnings.length ? (
          <StatusBanner className="advanced-warning-list" variant="warning" title={t.advancedWarnings}>
            <ul>{warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul>
          </StatusBanner>
        ) : null}
      </details>
    </section>
  )
}

function LoyaltyPanel({ loyalty, language, t }) {
  if (!loyalty) return <StatePanel message={t.advancedLoyaltyEmpty} />
  const categories = [
    { id: 'new', count: loyalty.newParticipants, share: loyalty.newShare },
    { id: 'returning', count: loyalty.returningParticipants, share: loyalty.returningShare },
    { id: 'regular', count: loyalty.regularParticipants, share: loyalty.regularShare },
    { id: 'reactivated', count: loyalty.reactivatedParticipants, share: loyalty.reactivatedShare },
    ...(loyalty.insufficientHistoryParticipants
      ? [{
          id: 'insufficient-history',
          count: loyalty.insufficientHistoryParticipants,
          share: null,
        }]
      : []),
  ]

  return (
    <div className="advanced-tab-content">
      <div className="advanced-metric-grid">
        <MetricCard label={t.advancedActiveParticipants} value={formatMetric(loyalty.activeParticipants, language, t)} />
        <MetricCard label={t.advancedReturningParticipants} value={formatMetric(loyalty.returningParticipants, language, t)} />
        <MetricCard label={t.advancedNewParticipants} value={formatMetric(loyalty.newParticipants, language, t)} />
        <MetricCard label={t.advancedRegularParticipants} value={formatMetric(loyalty.regularParticipants, language, t)} />
      </div>

      <div className="advanced-two-column">
        <section className="advanced-subcard liquid-inner-surface" aria-labelledby="advanced-loyalty-distribution">
          <div className="advanced-card-heading">
            <h3 id="advanced-loyalty-distribution">{t.advancedLoyaltyDistribution}</h3>
            <span className={`advanced-status-pill ${loyalty.isSufficient ? 'is-complete' : 'is-insufficient'}`}>
              {loyalty.isSufficient ? t.advancedHistorySufficient : t.advancedHistoryInsufficient}
            </span>
          </div>
          <ul className="advanced-distribution-list">
            {categories.map((category) => {
              const share = toPercent(category.share, true)
              return (
                <li key={category.id}>
                  <div>
                    <strong>{mappedLabel(t.advancedLoyaltyCategoryLabels, category.id, t.advancedUnknownValue)}</strong>
                    <span>
                      {formatMetric(category.count, language, t)}
                      {share === null ? '' : ` · ${formatPercent(category.share, language, false, true)}`}
                    </span>
                  </div>
                  {share === null ? null : (
                    <div
                      className="advanced-distribution-track"
                      role="progressbar"
                      aria-label={mappedLabel(t.advancedLoyaltyCategoryLabels, category.id, t.advancedUnknownValue)}
                      aria-valuemin="0"
                      aria-valuemax="100"
                      aria-valuenow={Math.max(0, Math.min(100, share))}
                    >
                      <span style={{ width: `${Math.max(0, Math.min(100, share))}%` }} />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </section>

        <details className="methodology-details advanced-subcard" id="advanced-loyalty-criteria">
          <summary>{t.advancedLoyaltyCriteria}</summary>
          <p>{t.advancedLoyaltyCriteriaNote}</p>
          <dl className="advanced-compact-metrics">
            <div><dt>{t.advancedKnownParticipantShare}</dt><dd>{formatMetricPercent(loyalty.knownParticipantsShare, language, t, false, true)}</dd></div>
            <div><dt>{t.advancedAverageStreamsAttended}</dt><dd>{formatMetric(loyalty.averageStreamsAttended, language, t, 1)}</dd></div>
            <div><dt>{t.advancedHistoryStreamsUsed}</dt><dd>{formatMetric(loyalty.historyStreamsUsed, language, t)}</dd></div>
            <div><dt>{t.advancedReactivatedParticipants}</dt><dd>{formatMetric(loyalty.reactivatedParticipants, language, t)}</dd></div>
          </dl>
        </details>
      </div>

      <section className="advanced-subcard liquid-inner-surface" aria-labelledby="advanced-loyal-participants">
        <div className="advanced-card-heading">
          <div>
            <h3 id="advanced-loyal-participants">{t.advancedTopLoyalParticipants}</h3>
            <p>{t.advancedChatActivityOnly}</p>
          </div>
        </div>
        {loyalty.topParticipants.length ? (
          <div className="advanced-table-scroll" role="region" aria-label={t.advancedTopLoyalParticipants} tabIndex="0">
            <table className="advanced-table">
              <thead>
                <tr>
                  <th scope="col">{t.advancedLogin}</th>
                  <th scope="col">{t.advancedCategory}</th>
                  <th scope="col">{t.advancedStreamsAttended}</th>
                  <th scope="col">{t.advancedSelectedStreamMessages}</th>
                  <th scope="col">{t.advancedCurrentStreak}</th>
                  <th className="advanced-optional-column" scope="col">{t.advancedFirstKnownAt}</th>
                </tr>
              </thead>
              <tbody>
                {loyalty.topParticipants.map((participant) => (
                  <tr key={participant.login}>
                    <th scope="row">{participant.login}</th>
                    <td>{mappedLabel(t.advancedLoyaltyCategoryLabels, participant.category, t.advancedUnknownValue)}</td>
                    <td>{formatMetric(participant.streamsAttended, language, t)}</td>
                    <td>{formatMetric(participant.messagesInSelectedStream, language, t)}</td>
                    <td>{formatMetric(participant.currentStreak, language, t)}</td>
                    <td className="advanced-optional-column">{formatDateTime(participant.firstKnownAt, language) ?? t.notAvailable}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <StatePanel message={t.advancedLoyalParticipantsEmpty} />}
      </section>
    </div>
  )
}

function ClipSuggestionsPanel({ clips, language, t }) {
  if (!clips.length) return <StatePanel message={t.advancedClipsEmpty} />
  return (
    <div className="advanced-tab-content">
      <details className="methodology-details advanced-context-details">
        <summary>{t.advancedMethodology}</summary>
        <p>{t.advancedClipWindowDisclaimer}</p>
      </details>
      <ol className="advanced-clip-list">
        {clips.slice(0, 5).map((clip, index) => {
          const evidenceValues = [
            clip.peakViewers,
            clip.peakMessagesPerMinute,
            clip.viewerBaselinePercent,
            clip.chatBaselinePercent,
          ]
          const hasCompleteEvidence = evidenceValues.every((value) => value !== null && value !== undefined && value !== '')
          return (
          <li className="advanced-clip-card liquid-inner-surface" key={`${clip.startTime}-${clip.peakTime}-${index}`}>
            <div className="advanced-card-heading">
              <div>
                <span className="advanced-rank">{index + 1}</span>
                <h3>{localizedText(clip.text, language, clip.label ?? t.advancedClipCandidate)}</h3>
                <p>
                  {formatTimeRange(clip.startTime, clip.endTime, language, t)}
                  {' · '}
                  {t.advancedPeakAt} {formatTimelineValue(clip.peakTime, language) ?? t.notAvailable}
                </p>
              </div>
              <div className="advanced-score-group">
                <span>{t.advancedScore} <strong>{formatScore(clip.score, language, t)}</strong></span>
                {hasCompleteEvidence ? <span>{t.advancedConfidence} <strong>{formatConfidence(clip.confidence, language, t)}</strong></span> : null}
              </div>
            </div>
            <dl className="advanced-compact-metrics is-primary-deltas">
              <div className={clip.viewerBaselinePercent === null || clip.viewerBaselinePercent === undefined ? 'is-missing' : ''}><dt>{t.advancedViewerBaselineChange}</dt><dd>{formatMetricPercent(clip.viewerBaselinePercent, language, t, true)}</dd></div>
              <div className={clip.chatBaselinePercent === null || clip.chatBaselinePercent === undefined ? 'is-missing' : ''}><dt>{t.advancedChatBaselineChange}</dt><dd>{formatMetricPercent(clip.chatBaselinePercent, language, t, true)}</dd></div>
            </dl>
            <details className="methodology-details">
              <summary>{t.advancedMoreMetrics}</summary>
              <dl className="advanced-compact-metrics">
                <div className={clip.peakViewers === null || clip.peakViewers === undefined ? 'is-missing' : ''}><dt>{t.advancedPeakViewers}</dt><dd>{formatMetric(clip.peakViewers, language, t)}</dd></div>
                <div className={clip.peakMessagesPerMinute === null || clip.peakMessagesPerMinute === undefined ? 'is-missing' : ''}><dt>{t.advancedPeakChat}</dt><dd>{formatMetric(clip.peakMessagesPerMinute, language, t, 1)}</dd></div>
              </dl>
            </details>
            <div className="advanced-reasons">
              <strong>{t.advancedReasons}</strong>
              {clip.reasons.length ? (
                <ul>
                  {clip.reasons.map((reason) => (
                    <li key={reason}>{mappedLabel(t.advancedClipReasonLabels, reason, t.advancedUnknownReason)}</li>
                  ))}
                </ul>
              ) : <span>{t.notAvailable}</span>}
            </div>
            {clip.marker?.label || clip.marker?.time ? (
              <p className="advanced-marker-note">
                <strong>{t.advancedRelatedMarker}</strong>{' '}
                {clip.marker.time ?? t.notAvailable}
                {clip.marker.label ? ` · ${clip.marker.label}` : ''}
              </p>
            ) : null}
          </li>
          )
        })}
      </ol>
    </div>
  )
}

function eventKey(event, index) {
  return event.eventId ?? `${event.time ?? 'event'}-${index}`
}

function EventImpactPanel({ events, language, t }) {
  const [selectedEventKey, setSelectedEventKey] = useState(null)
  if (!events.length) return <StatePanel message={t.advancedEventsEmpty} />
  const selectedIndex = events.findIndex((event, index) => eventKey(event, index) === selectedEventKey)
  const activeIndex = selectedIndex >= 0 ? selectedIndex : 0
  const selectedEvent = events[activeIndex]

  return (
    <div className="advanced-tab-content">
      <p className="advanced-context-note">{t.advancedCorrelationDisclaimer}</p>
      <div className="advanced-event-layout">
        <div className="advanced-event-list" aria-label={t.advancedEventList}>
          {events.map((event, index) => {
            const key = eventKey(event, index)
            const isActive = index === activeIndex
            return (
              <button
                className={`liquid-control ${isActive ? 'is-active' : ''}`}
                type="button"
                aria-pressed={isActive}
                onClick={() => setSelectedEventKey(key)}
                key={key}
              >
                <span>{event.time ?? t.notAvailable}</span>
                <strong>{event.label ?? mappedLabel(t.advancedEventTypeLabels, event.type, t.advancedUnknownEvent)}</strong>
                <small>{mappedLabel(t.advancedImpactDirectionLabels, event.direction, t.advancedUnknownValue)} · {formatMetricPercent(event.viewerPercent, language, t, true)}</small>
              </button>
            )
          })}
        </div>

        <article className="advanced-event-detail liquid-inner-surface" aria-live="polite">
          <div className="advanced-card-heading">
            <div>
              <p className="eyebrow">{selectedEvent.time ?? t.notAvailable}</p>
              <h3>{selectedEvent.label ?? mappedLabel(t.advancedEventTypeLabels, selectedEvent.type, t.advancedUnknownEvent)}</h3>
            </div>
            <span className={`advanced-status-pill is-${selectedEvent.direction ?? 'neutral'}`}>
              {mappedLabel(t.advancedImpactDirectionLabels, selectedEvent.direction, t.advancedUnknownValue)}
            </span>
          </div>
          <p className="advanced-event-explanation">
            {localizedText(selectedEvent.explanation, language, t.advancedImpactExplanationUnavailable)}
          </p>
          <div className="advanced-impact-groups">
            <section aria-labelledby="advanced-viewer-impact">
              <h4 id="advanced-viewer-impact">{t.advancedViewerImpact}</h4>
              <p className="advanced-impact-primary">{formatMetric(selectedEvent.viewersBefore, language, t, 1)} → {formatMetric(selectedEvent.viewersAfter, language, t, 1)} <strong>{formatMetricPercent(selectedEvent.viewerPercent, language, t, true)}</strong></p>
            </section>
            <section aria-labelledby="advanced-chat-impact">
              <h4 id="advanced-chat-impact">{t.advancedChatImpact}</h4>
              <p className="advanced-impact-primary">{formatMetric(selectedEvent.chatBefore, language, t, 1)} → {formatMetric(selectedEvent.chatAfter, language, t, 1)} <strong>{formatMetricPercent(selectedEvent.chatPercent, language, t, true)}</strong></p>
            </section>
          </div>
          <details className="methodology-details">
            <summary>{t.advancedMoreMetrics}</summary>
            <dl className="advanced-event-meta">
              <div><dt>{t.advancedAbsoluteChange}</dt><dd>{formatMetric(selectedEvent.viewerDelta, language, t, 1)} / {formatMetric(selectedEvent.chatDelta, language, t, 1)}</dd></div>
              <div><dt>{t.advancedMaximumAfter}</dt><dd>{formatMetric(selectedEvent.maxViewersAfter, language, t, 1)} / {formatMetric(selectedEvent.maxChatAfter, language, t, 1)}</dd></div>
              <div><dt>{t.advancedConfidence}</dt><dd>{formatConfidence(selectedEvent.confidence, language, t)}</dd></div>
              <div><dt>{t.advancedTimeToPeak}</dt><dd>{formatMinutes(selectedEvent.timeToPeakMinutes, language, t)}</dd></div>
              <div>
                <dt>{t.advancedEffectDuration}</dt>
                <dd>
                  {selectedEvent.effectCensored
                    ? formatMinutes(selectedEvent.effectObservedMinutes, language, t, true)
                    : formatMinutes(selectedEvent.effectDurationMinutes, language, t)}
                </dd>
              </div>
              <div>
                <dt>{t.advancedDataPoints}</dt>
                <dd>{formatMetric(selectedEvent.dataPoints.before, language, t)} / {formatMetric(selectedEvent.dataPoints.after, language, t)}</dd>
              </div>
            </dl>
          </details>
        </article>
      </div>
    </div>
  )
}

function RetentionTooltip({ active, payload, label, language, t }) {
  if (!active || !payload?.length) return null
  return (
    <div className="advanced-chart-tooltip">
      <strong>{t.time}: {label}</strong>
      {payload.map((entry) => (
        <span key={entry.dataKey}>
          {entry.dataKey === 'smoothedViewers' ? t.advancedSmoothedViewers : t.viewers}:{' '}
          {formatMetric(entry.value, language, t, 1)}
        </span>
      ))}
    </div>
  )
}

function curveValueAt(curve, time) {
  const point = curve.find((item) => item.time === time)
  return point?.smoothedViewers ?? point?.viewers ?? null
}

function RelatedList({ label, items, language, t }) {
  if (!items.length) return null
  return (
    <div className="advanced-related-list">
      <strong>{label}</strong>
      <ul>
        {items.map((item, index) => {
          const itemLabel = relatedItemLabel(item, language, t)
          return <li key={`${itemLabel}-${index}`}>{itemLabel}</li>
        })}
      </ul>
    </div>
  )
}

function RetentionPanel({ retention, dataQuality, language, t }) {
  const rawId = useId()
  const gradientId = `advancedRetentionGradient${rawId.replaceAll(':', '')}`
  if (!retention) return <StatePanel message={t.advancedRetentionEmpty} />
  const curve = retention.curve
  const orderedDrops = [...retention.drops].sort((first, second) => (
    (second.dropPercent ?? -1) - (first.dropPercent ?? -1)
    || (second.dropViewers ?? -1) - (first.dropViewers ?? -1)
  ))

  return (
    <div className="advanced-tab-content">
      <p className="advanced-context-note">{t.advancedAggregateRetentionDisclaimer}</p>
      {dataQuality.collectedPeriodOnly ? <StatusBanner className="advanced-context-note" variant="warning">{t.advancedCollectedRetentionDisclaimer}</StatusBanner> : null}
      <div className="advanced-metric-grid retention-primary-metrics">
        <MetricCard label={t.advancedStartViewers} value={formatMetric(retention.startViewers, language, t)} />
        <MetricCard label={t.advancedEndViewers} value={formatMetric(retention.endViewers, language, t)} />
        <MetricCard label={t.averageViewers} value={formatMetric(retention.averageViewers, language, t)} />
        <MetricCard label={t.peakViewers} value={formatMetric(retention.peakViewers, language, t)} />
        <MetricCard label={t.advancedLargestDrop} value={formatMetricPercent(retention.largestDrop?.dropPercent, language, t)} />
        <MetricCard label={t.advancedRecoveredDrops} value={`${formatMetric(retention.recoveredDropCount, language, t)} / ${formatMetric(retention.dropCount, language, t)}`} />
      </div>
      <details className="methodology-details">
        <summary>{t.advancedMoreMetrics}</summary>
        <dl className="advanced-compact-metrics">
          <div><dt>{t.advancedEndVsStart}</dt><dd>{formatMetricPercent(retention.endVsStartPercent, language, t, true)}</dd></div>
          <div><dt>{t.advancedEarlyBaselineViewers}</dt><dd>{formatMetric(retention.earlyBaselineViewers, language, t)}</dd></div>
          <div><dt>{t.advancedChangeFromEarlyBaseline}</dt><dd>{formatMetricPercent(retention.changeFromEarlyBaselinePercent, language, t, true)}</dd></div>
        </dl>
      </details>

      <section className="advanced-retention-chart liquid-inner-surface" aria-labelledby="advanced-retention-chart-title">
        <div className="advanced-card-heading">
          <div>
            <h3 id="advanced-retention-chart-title">{t.advancedViewerCurve}</h3>
            <p>{t.advancedViewerCurveNote}</p>
          </div>
          <div className="advanced-chart-legend" aria-label={t.advancedChartLegend}>
            <span className="is-viewers">{t.viewers}</span>
            <span className="is-smoothed">{t.advancedSmoothedViewers}</span>
          </div>
        </div>
        {curve.length >= 2 ? (
          <figure>
            <div className="advanced-chart-frame" role="img" aria-label={t.advancedRetentionChartAria}>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={curve} margin={{ top: 18, right: 16, left: -6, bottom: 8 }}>
                  <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--chart-viewers-line)" stopOpacity={0.22} />
                      <stop offset="95%" stopColor="var(--chart-viewers-line)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                  <XAxis dataKey="time" tick={{ fill: 'var(--theme-text-secondary)', fontSize: 12 }} axisLine={false} tickLine={false} minTickGap={20} />
                  <YAxis tickFormatter={(value) => formatNumber(value, language) ?? ''} tick={{ fill: 'var(--theme-text-secondary)', fontSize: 12 }} axisLine={false} tickLine={false} width={48} />
                  <Tooltip content={<RetentionTooltip language={language} t={t} />} cursor={{ stroke: 'var(--chart-cursor)' }} />
                  {retention.drops.map((drop, index) => (
                    <ReferenceArea
                      key={`${drop.startTime}-${index}`}
                      x1={drop.startTime}
                      x2={drop.endTime ?? drop.troughTime}
                      fill="var(--danger-red)"
                      fillOpacity={0.07}
                      strokeOpacity={0}
                    />
                  ))}
                  <Area type="monotone" dataKey="viewers" fill={`url(#${gradientId})`} stroke="var(--chart-viewers-line)" strokeWidth={1.75} isAnimationActive={false} />
                  <Line type="monotone" dataKey="smoothedViewers" stroke="var(--chart-messages-line)" strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
                  {retention.drops.map((drop, index) => {
                    const viewers = curveValueAt(curve, drop.troughTime)
                    return viewers === null ? null : (
                      <ReferenceDot
                        key={`${drop.troughTime}-${index}`}
                        x={drop.troughTime}
                        y={viewers}
                        r={4}
                        fill="var(--danger-red)"
                        stroke="var(--chart-marker-stroke)"
                        strokeWidth={2}
                      />
                    )
                  })}
                  {retention.drops.map((drop, index) => {
                    if (!drop.endTime || drop.status === 'not-recovered') return null
                    const viewers = curveValueAt(curve, drop.endTime)
                    return viewers === null ? null : (
                      <ReferenceDot
                        key={`recovery-${drop.endTime}-${index}`}
                        x={drop.endTime}
                        y={viewers}
                        r={4}
                        fill={drop.status === 'recovered' ? 'var(--theme-status)' : 'var(--amber)'}
                        stroke="var(--chart-marker-stroke)"
                        strokeWidth={2}
                      />
                    )
                  })}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <figcaption>{t.advancedRetentionChartCaption}</figcaption>
          </figure>
        ) : <StatePanel message={t.advancedRetentionCurveUnavailable} />}
      </section>

      <div className="advanced-two-column">
        <section className="advanced-subcard liquid-inner-surface" aria-labelledby="advanced-stable-segment">
          <h3 id="advanced-stable-segment">{t.advancedStableSegment}</h3>
          <p>{segmentLabel(retention.stableSegment, language, t)}</p>
        </section>
        <section className="advanced-subcard liquid-inner-surface" aria-labelledby="advanced-problem-segment">
          <h3 id="advanced-problem-segment">{t.advancedProblemSegment}</h3>
          <p>{segmentLabel(retention.problemSegment, language, t)}</p>
        </section>
      </div>

      <section className="advanced-subcard liquid-inner-surface" aria-labelledby="advanced-drop-list">
        <h3 id="advanced-drop-list">{t.advancedLargestDrops}</h3>
        {retention.drops.length ? (
          <ol className="advanced-drop-list">
            {orderedDrops.map((drop, index) => (
              <li key={`${drop.startTime}-${drop.troughTime}-${index}`}>
                <div className="advanced-card-heading">
                  <div>
                    <strong>{formatTimeRange(drop.startTime, drop.endTime, language, t)}</strong>
                    <span>{t.advancedTroughAt} {drop.troughTime ?? t.notAvailable}</span>
                  </div>
                  <span className={`advanced-status-pill is-${drop.status ?? 'not-recovered'}`}>
                    {mappedLabel(t.advancedRetentionStatusLabels, drop.status, t.advancedUnknownValue)}
                  </span>
                </div>
                <dl className="advanced-compact-metrics is-four-column">
                  <div><dt>{t.advancedViewerLoss}</dt><dd>{formatMetric(drop.dropViewers, language, t)}</dd></div>
                  <div><dt>{t.advancedPercentLoss}</dt><dd>{formatMetricPercent(drop.dropPercent, language, t)}</dd></div>
                  <div><dt>{t.advancedDropDuration}</dt><dd>{formatMetric(drop.durationMinutes, language, t, 1)} {t.minutesShort}</dd></div>
                  <div><dt>{t.advancedRecoveryRatio}</dt><dd>{formatMetricPercent(drop.recoveryRatio, language, t, false, true)}</dd></div>
                </dl>
                <RelatedList label={t.advancedRelatedMarkers} items={drop.relatedMarkers} language={language} t={t} />
                <RelatedList label={t.advancedRelatedSegments} items={drop.relatedSegments} language={language} t={t} />
              </li>
            ))}
          </ol>
        ) : <StatePanel message={t.advancedDropsEmpty} />}
      </section>
    </div>
  )
}

function getNextAdvancedTabIndex(currentIndex, key, tabCount) {
  if (key === 'Home') return 0
  if (key === 'End') return tabCount - 1
  if (key === 'ArrowRight') return (currentIndex + 1) % tabCount
  if (key === 'ArrowLeft') return (currentIndex - 1 + tabCount) % tabCount
  return currentIndex
}

function hasAdvancedContent(data) {
  return Boolean(
    data?.loyalty
    || data?.clipSuggestions?.length
    || data?.eventImpact?.length
    || data?.retention,
  )
}

function AdvancedInsights({
  data = null,
  isLoading = false,
  error = null,
  onRetry = null,
  streamId = null,
  language = 'ru',
  scope = 'all',
  sectionId = 'insights',
  showDataQuality = true,
  t,
}) {
  const scopedTabs = scope === 'audience'
    ? TAB_DEFINITIONS.filter((tab) => tab.id === 'loyalty' || tab.id === 'retention')
    : scope === 'content'
      ? TAB_DEFINITIONS.filter((tab) => tab.id === 'clips' || tab.id === 'events')
      : TAB_DEFINITIONS
  const [activeTabId, setActiveTabId] = useState(scopedTabs[0].id)
  const tabRefs = useRef([])
  const rawId = useId()
  const idPrefix = `advancedInsights${rawId.replaceAll(':', '')}`
  const activeTabIndex = Math.max(0, scopedTabs.findIndex((tab) => tab.id === activeTabId))
  const activeTab = scopedTabs[activeTabIndex]

  function handleTabKeyDown(event, index) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const nextIndex = getNextAdvancedTabIndex(index, event.key, scopedTabs.length)
    setActiveTabId(scopedTabs[nextIndex].id)
    tabRefs.current[nextIndex]?.focus()
  }

  let body
  if (isLoading) {
    body = <StatePanel message={t.advancedLoading} />
  } else if (error) {
    body = <StatePanel message={t.advancedError} role="alert" actionLabel={t.retryRequest} onAction={onRetry} />
  } else if (!streamId) {
    body = <StatePanel message={t.advancedSelectStream} />
  } else if (!data) {
    body = <StatePanel message={t.advancedEmpty} />
  } else {
    const qualityHeadingId = `${idPrefix}-quality-heading`
    const quality = showDataQuality ? <DataQualityBlock data={data} language={language} t={t} headingId={qualityHeadingId} /> : null
    if (data.dataQuality.status === 'insufficient') {
      body = (
        <>
          {quality}
          <StatePanel message={t.advancedInsufficientData} />
        </>
      )
    } else if (!hasAdvancedContent(data)) {
      body = (
        <>
          {quality}
          <StatePanel message={t.advancedEmpty} />
        </>
      )
    } else {
      let panel
      if (activeTab.id === 'loyalty') panel = <LoyaltyPanel loyalty={data.loyalty} language={language} t={t} />
      if (activeTab.id === 'clips') panel = <ClipSuggestionsPanel clips={data.clipSuggestions} language={language} t={t} />
      if (activeTab.id === 'events') panel = <EventImpactPanel events={data.eventImpact} language={language} t={t} />
      if (activeTab.id === 'retention') panel = <RetentionPanel retention={data.retention} dataQuality={data.dataQuality} language={language} t={t} />
      body = (
        <>
          {quality}
          {showDataQuality && data.dataQuality.status === 'partial' ? (
            <StatusBanner className="advanced-partial-notice" variant="warning">{t.advancedPartialData}</StatusBanner>
          ) : null}
          <SegmentedControl className="advanced-insights-tabs" role="tablist" label={t.advancedTabsLabel}>
            {scopedTabs.map((tab, index) => {
              const selected = tab.id === activeTab.id
              const tabId = `${idPrefix}-tab-${tab.id}`
              const panelId = `${idPrefix}-panel-${tab.id}`
              return (
                <button
                  ref={(element) => { tabRefs.current[index] = element }}
                  id={tabId}
                  className={`segment-button ${selected ? 'is-active' : ''}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={panelId}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setActiveTabId(tab.id)}
                  onKeyDown={(event) => handleTabKeyDown(event, index)}
                  key={tab.id}
                >
                  {t[tab.labelKey]}
                </button>
              )
            })}
          </SegmentedControl>
          {scopedTabs.map((tab) => {
            const selected = tab.id === activeTab.id
            return (
              <section
                className="advanced-insights-panel"
                id={`${idPrefix}-panel-${tab.id}`}
                role="tabpanel"
                aria-labelledby={`${idPrefix}-tab-${tab.id}`}
                hidden={!selected}
                tabIndex={selected ? 0 : -1}
                key={tab.id}
              >
                {selected ? panel : null}
              </section>
            )
          })}
        </>
      )
    }
  }

  return (
    <Reveal
      as="section"
      className="section-panel advanced-insights liquid-glass liquid-surface"
      id={sectionId}
      aria-labelledby={`${idPrefix}-title`}
      data-entity-type="stream"
      data-entity-id={streamId ?? undefined}
      data-liquid-interactive
    >
      <div className="section-heading">
        <div>
          <h2 id={`${idPrefix}-title`}>{t.advancedInsightsTitle}</h2>
        </div>
      </div>
      {body}
    </Reveal>
  )
}

export default AdvancedInsights
