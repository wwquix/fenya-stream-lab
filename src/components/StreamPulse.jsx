import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from "motion/react"
import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import ScannerTooltip from './ScannerTooltip.jsx'
import { MotionCard, Reveal } from './MotionPrimitives.jsx'
import { formatCategory, formatEventLabel, formatSummaryValue } from '../i18n/translations.js'

const rangeOptions = [
  { id: 'full', labelKey: 'full' },
  { id: 'first-hour', labelKey: 'firstHour' },
  { id: 'peak', labelKey: 'peakPeriod' },
  { id: 'final-hour', labelKey: 'finalHour' },
]

function minutesFromTime(time) {
  const [hours, minutes] = time.split(':').map(Number)
  return (hours < 6 ? hours + 24 : hours) * 60 + minutes
}

function getActiveCategory(time, segments = []) {
  const timeMinutes = minutesFromTime(time)
  const segment = segments.find((item) => timeMinutes >= minutesFromTime(item.start) && timeMinutes <= minutesFromTime(item.end))
  return segment?.category ?? 'Live stream'
}

function getSegmentSize(segment) {
  return minutesFromTime(segment.end) - minutesFromTime(segment.start)
}

function getSegmentRange(segment, chartData) {
  if (!segment || !chartData.length) {
    return null
  }

  const streamStart = minutesFromTime(chartData[0].time)

  return {
    start: minutesFromTime(segment.start) - streamStart,
    end: minutesFromTime(segment.end) - streamStart,
  }
}

function getStreamDuration(chartData) {
  if (chartData.length < 2) {
    return 0
  }

  return minutesFromTime(chartData[chartData.length - 1].time) - minutesFromTime(chartData[0].time)
}

function getElapsedMinutes(time, chartData) {
  if (!chartData.length) {
    return 0
  }

  return minutesFromTime(time) - minutesFromTime(chartData[0].time)
}

function normalizeChartData(chartData, targetDuration = getStreamDuration(chartData)) {
  const sourceDuration = getStreamDuration(chartData)

  return chartData.map((point) => {
    const elapsed = getElapsedMinutes(point.time, chartData)
    const elapsedMinute = sourceDuration > 0 && targetDuration > 0 ? (elapsed / sourceDuration) * targetDuration : elapsed

    return {
      ...point,
      elapsedMinute,
    }
  })
}

function getNearestChartPoint(time, chartData) {
  const target = minutesFromTime(time)
  return chartData.reduce((nearest, point) => {
    const currentDistance = Math.abs(minutesFromTime(point.time) - target)
    const nearestDistance = Math.abs(minutesFromTime(nearest.time) - target)
    return currentDistance < nearestDistance ? point : nearest
  }, chartData[0])
}

function getEventForPoint(point, events) {
  return events.find((event) => event.id === point.eventId || event.time === point.time || Math.abs(minutesFromTime(event.time) - minutesFromTime(point.time)) <= 10)
}

function filterChartDataByRange(chartData, range, duration) {
  if (range === 'full' || chartData.length < 2) {
    return chartData
  }

  if (range === 'first-hour') {
    return chartData.filter((point) => point.elapsedMinute <= Math.min(60, duration))
  }

  if (range === 'final-hour') {
    return chartData.filter((point) => point.elapsedMinute >= Math.max(0, duration - 60))
  }

  const peakPoint = chartData.reduce((peak, point) => (point.viewers > peak.viewers ? point : peak), chartData[0])
  return chartData.filter((point) => Math.abs(point.elapsedMinute - peakPoint.elapsedMinute) <= 45)
}

function StreamPulseTooltip({ active, label, payload, stream, events, t }) {
  if (!active || !payload?.length) {
    return null
  }

  const viewers = payload.find((item) => item.dataKey === 'viewers')?.value
  const chatMessages = payload.find((item) => item.dataKey === 'chatMessagesPerMinute')?.value
  const point = payload.find((item) => item.dataKey === 'viewers')?.payload
  const category = point?.category ?? getActiveCategory(label, stream.categorySegments)
  const event = point ? getEventForPoint(point, events) : null

  return (
    <div className="stream-tooltip">
      <div className="stream-tooltip-preview">
        <span>{t.streamPreview}</span>
        <strong>{t.previewSlot}</strong>
      </div>
      <div className="stream-tooltip-body">
        <strong>{point?.time ?? label}</strong>
        <span>{formatCategory(category, t)}</span>
        <dl>
          <div>
            <dt>{t.viewers}</dt>
            <dd>{viewers?.toLocaleString()}</dd>
          </div>
          <div>
            <dt>{t.chatPerMin}</dt>
            <dd>{chatMessages?.toLocaleString()}</dd>
          </div>
        </dl>
        {event ? <p>{formatEventLabel(event.label, t)}</p> : null}
      </div>
    </div>
  )
}

function StreamPulse({ stream, compareStream, events, selectedCategory = 'All', onCategorySelect, t }) {
  const [selectedRange, setSelectedRange] = useState('full')
  const [selectedSegmentId, setSelectedSegmentId] = useState(null)
  const prefersReducedMotion = useReducedMotion()
  const streamEvents = events.filter((event) => event.streamId === stream.id)
  const streamDuration = getStreamDuration(stream.chartData)
  const normalizedChartData = normalizeChartData(stream.chartData)
  const visibleChartData = filterChartDataByRange(normalizedChartData, selectedRange, streamDuration)
  const visibleDomain = [
    visibleChartData[0]?.elapsedMinute ?? 0,
    visibleChartData[visibleChartData.length - 1]?.elapsedMinute ?? streamDuration,
  ]
  const compareChartData = compareStream ? filterChartDataByRange(normalizeChartData(compareStream.chartData, streamDuration), selectedRange, streamDuration) : []
  const visibleTimes = new Set(visibleChartData.map((point) => point.time))
  const eventMarkers = streamEvents.map((event) => ({
    ...event,
    point: normalizedChartData.find((point) => point.time === getNearestChartPoint(event.time, stream.chartData).time),
  })).filter((event) => visibleTimes.has(event.point.time))
  const totalSegmentMinutes = stream.categorySegments.reduce((total, segment) => total + getSegmentSize(segment), 0)
  const selectedSegment = stream.categorySegments.find((segment) => segment.id === selectedSegmentId)
  const selectedSegmentRange = getSegmentRange(selectedSegment, stream.chartData)
  const visibleSelectedRange = selectedSegmentRange
    ? {
        start: Math.max(selectedSegmentRange.start, visibleDomain[0]),
        end: Math.min(selectedSegmentRange.end, visibleDomain[1]),
      }
    : null
  const compareLabel = compareStream ? `Compare: ${compareStream.title}` : null
  const insights = [
    { label: t.peakMoment, value: formatSummaryValue(stream.summary.peakMoment, t) },
    { label: t.strongestChatSpike, value: formatSummaryValue(stream.summary.strongestChatSpike, t) },
    { label: t.bestCategory, value: formatCategory(stream.summary.bestCategory, t) },
    { label: t.viewerDrop, value: formatSummaryValue(stream.summary.viewerDrop, t) },
    { label: t.moderatorLoad, value: formatSummaryValue(stream.summary.moderatorLoad, t) },
  ]

  useEffect(() => {
    if (!stream.categorySegments.some((segment) => segment.id === selectedSegmentId)) {
      setSelectedSegmentId(null)
    }
  }, [selectedSegmentId, stream.categorySegments])

  useEffect(() => {
    if (selectedSegment && selectedCategory !== selectedSegment.category) {
      setSelectedSegmentId(null)
    }
  }, [selectedCategory, selectedSegment])

  function handleSegmentSelect(segment) {
    const isSelected = selectedSegmentId === segment.id
    setSelectedSegmentId(isSelected ? null : segment.id)
    onCategorySelect?.(isSelected ? 'All' : segment.category)
  }

  return (
    <Reveal as="section" className="section-panel stream-pulse" id="stream-pulse" aria-labelledby="stream-pulse-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{t.streamControls}</p>
          <h2 id="stream-pulse-title">{t.streamPulse}</h2>
          <p className="section-note">{t.streamPulseNote}</p>
        </div>
        <span className="section-kicker">{t.viewers} / {t.chatPerMin}</span>
      </div>

      <div className="chart-shell glass-panel" data-entity-type="stream" data-entity-id={stream.id}>
        <div className="chart-toolbar">
          <div className="chart-legend" aria-label="Chart legend">
            <span className="legend-viewers">{t.viewers}</span>
            <span className="legend-chat">{t.chatPerMin}</span>
            {compareLabel ? <span className="legend-compare">{compareLabel}</span> : null}
          </div>
          <div className="chart-event-list" aria-label={t.keyEvents}>
            {streamEvents.slice(0, 4).map((event) => (
              <ScannerTooltip
                key={event.id}
                type="event"
                id={event.id}
                label={`${formatEventLabel(event.label, t)} / ${event.time}`}
                className={`chart-event-pill event-${event.type}`}
              >
                <span>{event.time}</span>
                <strong>{formatEventLabel(event.label, t)}</strong>
              </ScannerTooltip>
            ))}
          </div>
          <div className="chart-range-controls" aria-label="Timeline range">
            {rangeOptions.map((option) => (
              <button className={selectedRange === option.id ? 'is-active' : ''} type="button" onClick={() => setSelectedRange(option.id)} key={option.id}>
                {selectedRange === option.id ? (
                  <motion.span
                    className="segmented-active-indicator"
                    layoutId="chart-range-active"
                    transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                    aria-hidden="true"
                  />
                ) : null}
                <span className="segmented-label">{t[option.labelKey]}</span>
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={visibleChartData} margin={{ top: 28, right: 28, left: -8, bottom: 12 }}>
            <defs>
              <linearGradient id="chatGlow" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--cyan)" stopOpacity={0.18} />
                <stop offset="95%" stopColor="var(--cyan)" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="viewerGlow" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--violet)" stopOpacity={0.28} />
                <stop offset="95%" stopColor="var(--violet)" stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(214,225,231,0.08)" vertical={false} />
            <XAxis
              dataKey="elapsedMinute"
              type="number"
              domain={visibleDomain}
              tickFormatter={(value) => {
                const nearest = normalizedChartData.reduce((closest, point) => (Math.abs(point.elapsedMinute - value) < Math.abs(closest.elapsedMinute - value) ? point : closest), normalizedChartData[0])
                return nearest?.time ?? ''
              }}
              tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip content={<StreamPulseTooltip stream={stream} events={streamEvents} t={t} />} />
            {visibleSelectedRange && visibleSelectedRange.end > visibleSelectedRange.start ? (
              <ReferenceArea
                x1={visibleSelectedRange.start}
                x2={visibleSelectedRange.end}
                fill="rgba(94, 231, 255, 0.13)"
                strokeOpacity={0}
                ifOverflow="hidden"
              />
            ) : null}
            <Area type="monotone" dataKey="viewers" fill="url(#viewerGlow)" stroke="var(--violet)" strokeWidth={2.5} />
            <Line type="monotone" dataKey="chatMessagesPerMinute" stroke="var(--cyan)" strokeWidth={3} dot={false} />
            {compareStream ? <Line type="monotone" data={compareChartData} dataKey="viewers" stroke="rgba(226,238,237,0.36)" strokeWidth={2} strokeDasharray="5 5" dot={false} /> : null}
            {eventMarkers.map((event) => (
              <ReferenceDot
                key={event.id}
                x={event.point.elapsedMinute}
                y={event.point.chatMessagesPerMinute}
                r={5}
                fill={event.type === 'ban' || event.type === 'timeout' ? '#ffb488' : 'var(--toxic-green)'}
                stroke="rgba(8, 12, 15, 0.92)"
                strokeWidth={2}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>

        <div className="category-timeline" aria-label="Stream category timeline">
          {stream.categorySegments.map((segment) => {
            const isSegmentActive = selectedSegmentId === segment.id || (!selectedSegmentId && selectedCategory === segment.category)

            return (
            <motion.button
              className={`category-segment ${selectedSegmentId === segment.id || (!selectedSegmentId && selectedCategory === segment.category) ? 'is-active' : ''} ${selectedCategory !== 'All' && selectedCategory !== segment.category ? 'is-muted' : ''}`}
              style={{ '--segment-size': `${(getSegmentSize(segment) / totalSegmentMinutes) * 100}%` }}
              title={`${segment.start}-${segment.end} ${formatCategory(segment.category, t)}`}
              type="button"
              onClick={() => handleSegmentSelect(segment)}
              key={segment.id}
              whileTap={prefersReducedMotion ? undefined : { scale: 0.99 }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            >
              {isSegmentActive ? (
                <motion.span
                  className="category-segment-wash"
                  layoutId={`category-segment-wash-${stream.id}`}
                  transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
                  aria-hidden="true"
                />
              ) : null}
              <span>{segment.start}-{segment.end}</span>
              <strong>{formatCategory(segment.category, t)}</strong>
            </motion.button>
            )
          })}
        </div>
      </div>

      <div className="pulse-insight-grid">
        {insights.map((insight) => (
          <MotionCard as="article" className="pulse-insight-card glass-panel" key={insight.label}>
            <span>{insight.label}</span>
            <strong>{insight.value}</strong>
          </MotionCard>
        ))}
      </div>
    </Reveal>
  )
}

export default StreamPulse
