import { useState } from 'react'
import { motion, useReducedMotion } from "motion/react"
import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Reveal } from './MotionPrimitives.jsx'
import { formatCategory, formatEventLabel, formatStreamTitle } from '../i18n/translations.js'

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

function getEventForElapsed(elapsedMinute, events, chartData) {
  const streamStart = minutesFromTime(chartData[0].time)

  return events.find((event) => Math.abs(minutesFromTime(event.time) - streamStart - elapsedMinute) <= 3)
}

function getNearestPointByElapsed(elapsedMinute, chartData) {
  return chartData.reduce((nearest, point) => {
    const currentDistance = Math.abs(point.elapsedMinute - elapsedMinute)
    const nearestDistance = Math.abs(nearest.elapsedMinute - elapsedMinute)
    return currentDistance < nearestDistance ? point : nearest
  }, chartData[0])
}

function formatCompactNumber(value) {
  if (value >= 1000) {
    const compact = value / 1000
    return `${Number.isInteger(compact) ? compact.toFixed(0) : compact.toFixed(1)}k`
  }

  return String(value)
}

function getYAxisTicks(points, comparePoints = []) {
  const maxValue = [...points, ...comparePoints].reduce((max, point) => Math.max(max, point.viewers, point.chatMessagesPerMinute), 0)
  const ceiling = Math.max(2500, Math.ceil(maxValue / 2500) * 2500)
  const ticks = []

  for (let value = 0; value <= ceiling; value += 2500) {
    ticks.push(value)
  }

  return ticks
}

function formatTimecodeFromOffset(offsetSeconds, chartData) {
  const streamStartSeconds = minutesFromTime(chartData[0].time) * 60
  const totalSeconds = streamStartSeconds + offsetSeconds
  const hours = Math.floor(totalSeconds / 3600) % 24
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (value) => String(value).padStart(2, '0')

  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}

function getSegmentForElapsed(elapsedMinute, stream) {
  return stream.categorySegments.find((item) => {
    const range = getSegmentRange(item, stream.chartData)
    return range && elapsedMinute >= range.start && elapsedMinute <= range.end
  })
}

function getPreviewTone(category) {
  if (category === 'CS2') {
    return 'cs2'
  }

  if (category === 'Minecraft') {
    return 'minecraft'
  }

  if (category === 'Just Chatting') {
    return 'chatting'
  }

  return 'other'
}

function getPreviewStyle(frameIndex, point) {
  return {
    '--preview-pan-x': `${(frameIndex % 9) - 4}px`,
    '--preview-pan-y': `${(Math.floor(frameIndex / 3) % 7) - 3}px`,
    '--preview-scan': `${12 + (frameIndex % 11) * 7}%`,
    '--preview-heat': `${Math.min(1, point.chatMessagesPerMinute / 6000)}`,
  }
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
        <span>{point?.time ?? label}</span>
        <strong>{point?.previewLabel ?? t.previewSlot}</strong>
      </div>
      <div className="stream-tooltip-body">
        <span className="stream-tooltip-kicker">{t.streamPreview}</span>
        <strong>{point?.previewLabel ?? t.previewSlot}</strong>
        <span>{formatCategory(category, t)}</span>
        <dl>
          <div>
            <dt>{t.time}</dt>
            <dd>{point?.time ?? label}</dd>
          </div>
          <div>
            <dt>{t.viewers}</dt>
            <dd>{viewers?.toLocaleString()}</dd>
          </div>
          <div>
            <dt>{t.chatPerMin}</dt>
            <dd>{chatMessages?.toLocaleString()}</dd>
          </div>
        </dl>
        {event ? <p><span>{t.event}</span>{formatEventLabel(event.label, t)}</p> : null}
      </div>
    </div>
  )
}

function StreamPulse({ stream, compareStream, events, t }) {
  const [selectedSegmentId, setSelectedSegmentId] = useState(null)
  const [replayPreview, setReplayPreview] = useState(null)
  const prefersReducedMotion = useReducedMotion()
  const streamEvents = events.filter((event) => event.streamId === stream.id)
  const streamDuration = getStreamDuration(stream.chartData)
  const normalizedChartData = normalizeChartData(stream.chartData)
  const visibleChartData = normalizedChartData
  const visibleDomain = [
    visibleChartData[0]?.elapsedMinute ?? 0,
    visibleChartData[visibleChartData.length - 1]?.elapsedMinute ?? streamDuration,
  ]
  const compareChartData = compareStream ? normalizeChartData(compareStream.chartData, streamDuration) : []
  const yAxisTicks = getYAxisTicks(visibleChartData, compareChartData)
  const visibleTimes = new Set(visibleChartData.map((point) => point.time))
  const eventMarkers = streamEvents.map((event) => ({
    ...event,
    point: normalizedChartData.find((point) => point.time === getNearestChartPoint(event.time, stream.chartData).time),
  })).filter((event) => visibleTimes.has(event.point.time))
  const totalSegmentMinutes = stream.categorySegments.reduce((total, segment) => total + getSegmentSize(segment), 0)
  const activeSelectedSegmentId = stream.categorySegments.some((segment) => segment.id === selectedSegmentId)
    ? selectedSegmentId
    : null
  const selectedSegment = stream.categorySegments.find((segment) => segment.id === activeSelectedSegmentId)
  const selectedSegmentRange = getSegmentRange(selectedSegment, stream.chartData)
  const visibleSelectedRange = selectedSegmentRange
    ? {
        start: Math.max(selectedSegmentRange.start, visibleDomain[0]),
        end: Math.min(selectedSegmentRange.end, visibleDomain[1]),
      }
    : null
  const compareLabel = compareStream ? `${t.compare}: ${formatStreamTitle(compareStream, t)}` : null

  function handleSegmentSelect(segment) {
    const isSelected = activeSelectedSegmentId === segment.id
    setSelectedSegmentId(isSelected ? null : segment.id)
  }

  function handleReplayHover(event) {
    const rect = event.currentTarget.getBoundingClientRect()
    const progress = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    const roundedSeconds = Math.round((progress * streamDuration * 60) / 3) * 3
    const elapsedMinute = roundedSeconds / 60
    const point = getNearestPointByElapsed(elapsedMinute, normalizedChartData)
    const segment = getSegmentForElapsed(elapsedMinute, stream)
    const category = segment?.category ?? point.category
    const eventForFrame = getEventForElapsed(elapsedMinute, streamEvents, stream.chartData) ?? getEventForPoint(point, streamEvents)
    const frameIndex = Math.round(roundedSeconds / 3)

    setReplayPreview({
      point,
      category,
      event: eventForFrame,
      frameIndex,
      style: getPreviewStyle(frameIndex, point),
      timecode: formatTimecodeFromOffset(roundedSeconds, stream.chartData),
      tone: getPreviewTone(category),
      x: `${Math.min(86, Math.max(14, progress * 100))}%`,
    })
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

      <div className="chart-shell glass-panel liquid-card subtle-shine soft-glow" data-entity-type="stream" data-entity-id={stream.id}>
        <div className="chart-toolbar replay-console-toolbar">
          <div className="chart-legend" aria-label="Chart legend">
            <span className="legend-viewers">{t.viewers}</span>
            <span className="legend-chat">{t.chatPerMin}</span>
            {compareLabel ? <span className="legend-compare">{compareLabel}</span> : null}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={visibleChartData} margin={{ top: 28, right: 28, left: -8, bottom: 12 }}>
            <defs>
              <linearGradient id="chatGlow" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--cyan)" stopOpacity={0.18} />
                <stop offset="95%" stopColor="var(--cyan)" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="viewerGlow" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--chart-viewers-line)" stopOpacity={0.2} />
                <stop offset="95%" stopColor="var(--chart-viewers-line)" stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
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
            <YAxis
              domain={[0, yAxisTicks[yAxisTicks.length - 1]]}
              ticks={yAxisTicks}
              tickFormatter={formatCompactNumber}
              tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            <Tooltip cursor={{ stroke: 'var(--chart-cursor)', strokeWidth: 1 }} content={<StreamPulseTooltip stream={stream} events={streamEvents} t={t} />} />
            {visibleSelectedRange && visibleSelectedRange.end > visibleSelectedRange.start ? (
              <ReferenceArea
                x1={visibleSelectedRange.start}
                x2={visibleSelectedRange.end}
                fill="var(--chart-selection)"
                strokeOpacity={0}
                ifOverflow="hidden"
              />
            ) : null}
            <Area type="monotone" dataKey="viewers" fill="url(#viewerGlow)" stroke="var(--chart-viewers-line)" strokeWidth={2.5} />
            <Line type="monotone" dataKey="chatMessagesPerMinute" stroke="var(--chart-messages-line)" strokeWidth={2.5} dot={false} />
            {compareStream ? <Line type="monotone" data={compareChartData} dataKey="viewers" stroke="var(--chart-compare-line)" strokeWidth={2} strokeDasharray="5 5" dot={false} /> : null}
            {eventMarkers.map((event) => (
              <ReferenceDot
                key={event.id}
                x={event.point.elapsedMinute}
                y={event.point.chatMessagesPerMinute}
                r={5}
                fill={event.type === 'ban' || event.type === 'timeout' ? 'var(--danger-red)' : 'var(--chart-marker)'}
                stroke="var(--chart-marker-stroke)"
                strokeWidth={2}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>

        <div className="replay-strip" aria-label="Stream replay timeline" onMouseMove={handleReplayHover} onMouseLeave={() => setReplayPreview(null)}>
          <div className="replay-strip-rail">
          {stream.categorySegments.map((segment) => {
            const isSegmentActive = activeSelectedSegmentId === segment.id

            return (
            <motion.button
              className={`replay-segment category-segment ${isSegmentActive ? 'is-active' : ''}`}
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
          {replayPreview ? (
            <div className="replay-preview-card stream-tooltip" style={{ left: replayPreview.x }}>
              <div className={`replay-preview-frame is-${replayPreview.tone}`} style={replayPreview.style}>
                <div className="preview-scene">
                  <span className="preview-live">LIVE</span>
                  <span className="preview-timecode">{replayPreview.timecode}</span>
                  <strong>{replayPreview.point.previewLabel ?? t.previewSlot}</strong>
                  <div className="preview-chat">
                    <span>{formatCompactNumber(replayPreview.point.viewers)} {t.viewers}</span>
                    <span>{formatCompactNumber(replayPreview.point.chatMessagesPerMinute)}/min</span>
                    <span>{replayPreview.event ? formatEventLabel(replayPreview.event.label, t) : formatCategory(replayPreview.category, t)}</span>
                  </div>
                </div>
              </div>
              <div className="stream-tooltip-body">
                <span className="stream-tooltip-kicker">{t.streamPreview}</span>
                <strong>{replayPreview.point.previewLabel ?? t.previewSlot}</strong>
                <span>{formatCategory(replayPreview.category, t)}</span>
                <dl>
                  <div>
                    <dt>{t.time}</dt>
                    <dd>{replayPreview.timecode}</dd>
                  </div>
                  <div>
                    <dt>{t.viewers}</dt>
                    <dd>{replayPreview.point.viewers.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>{t.chatPerMin}</dt>
                    <dd>{replayPreview.point.chatMessagesPerMinute.toLocaleString()}</dd>
                  </div>
                </dl>
                {replayPreview.event ? <p><span>{t.event}</span>{formatEventLabel(replayPreview.event.label, t)}</p> : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>

    </Reveal>
  )
}

export default StreamPulse
