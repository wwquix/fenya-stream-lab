function finiteNumber(value) {
  return Number.isFinite(value) ? value : null
}

function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function minutesFromTime(value) {
  if (!/^\d{2}:\d{2}$/.test(value ?? '')) return null
  const [hours, minutes] = value.split(':').map(Number)
  return (hours < 6 ? hours + 24 : hours) * 60 + minutes
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export function buildInternalSessions(archive, currentAnalytics, isLive = false) {
  const sessions = Array.isArray(archive?.streams)
    ? archive.streams.map((stream) => ({
        id: stream.streamId,
        streamId: stream.streamId,
        sessionId: stream.streamId,
        title: stream.title,
        date: stream.date,
        category: stream.categoryName,
        status: stream.status,
        durationMinutes: stream.durationMinutes,
        averageViewers: stream.averageViewers,
        peakViewers: stream.peakViewers,
        totalMessages: stream.totalMessages,
        uniqueChatters: stream.uniqueChatters,
        topWords: stream.topWords,
        samples: [],
      }))
    : []
  const currentId = text(currentAnalytics?.streamId)

  if (currentId) {
    const existing = sessions.find((session) => session.id === currentId)
    const current = {
      id: currentId,
      streamId: currentId,
      sessionId: currentId,
      title: currentAnalytics.title ?? existing?.title ?? currentId,
      date: currentAnalytics.startedAt?.slice(0, 10) ?? existing?.date ?? null,
      category: currentAnalytics.categoryName ?? existing?.category ?? null,
      status: isLive ? 'live' : existing?.status ?? 'completed',
      durationMinutes: existing?.durationMinutes ?? null,
      averageViewers: existing?.averageViewers ?? null,
      peakViewers: existing?.peakViewers ?? null,
      totalMessages: existing?.totalMessages ?? null,
      uniqueChatters: existing?.uniqueChatters ?? null,
      topWords: existing?.topWords ?? [],
      samples: currentAnalytics.points ?? [],
      events: currentAnalytics.events ?? [],
    }
    if (existing) sessions.splice(sessions.indexOf(existing), 1)
    sessions.unshift(current)
  }

  return sessions
}

export function chooseDefaultSessionId(sessions, currentStreamId, isLive) {
  if (!sessions.length) return ''
  if (isLive && currentStreamId && sessions.some((session) => session.id === currentStreamId)) return currentStreamId
  return sessions[0].id
}

export function getCompareSessionOptions(sessions, selectedSessionId) {
  return sessions.filter((session) => session.id !== selectedSessionId)
}

export function mergeSessionData(base, report, liveData = {}) {
  if (!base && !report) return null
  const summary = report?.summary ?? {}
  const metrics = summary.metrics ?? {}
  const samples = liveData.samples?.length ? liveData.samples : report?.analytics?.viewerSamples ?? base?.samples ?? []
  return {
    ...base,
    id: report?.stream?.streamId ?? base?.id,
    streamId: report?.stream?.streamId ?? base?.streamId,
    sessionId: report?.stream?.streamSessionId ?? base?.sessionId ?? base?.streamId,
    title: report?.stream?.title ?? base?.title,
    date: report?.stream?.date ?? base?.date,
    category: report?.stream?.categoryName ?? base?.category,
    status: report?.stream?.status ?? base?.status,
    durationMinutes: finiteNumber(metrics.durationMinutes) ?? base?.durationMinutes ?? null,
    averageViewers: finiteNumber(metrics.averageViewers) ?? base?.averageViewers ?? null,
    peakViewers: finiteNumber(metrics.peakViewers) ?? base?.peakViewers ?? null,
    totalMessages: finiteNumber(liveData.totalMessages) ?? finiteNumber(metrics.totalMessages) ?? base?.totalMessages ?? null,
    uniqueChatters: finiteNumber(liveData.uniqueChatters) ?? finiteNumber(metrics.uniqueChatters) ?? base?.uniqueChatters ?? null,
    activityPeak: finiteNumber(liveData.activityPeak) ?? null,
    topChatters: liveData.topChatters?.length ? liveData.topChatters : summary.topChatters ?? report?.chat?.topChatters ?? [],
    topWords: liveData.topWords?.length ? liveData.topWords : summary.topWords ?? report?.words?.topWords ?? base?.topWords ?? [],
    samples: samples.map((sample) => ({
      timestamp: sample.timestamp ?? sample.sampledAt ?? sample.time ?? null,
      time: sample.time ?? sample.timestamp?.slice(11, 16) ?? null,
      viewers: finiteNumber(sample.viewers),
      messagesPerMinute: finiteNumber(sample.messagesPerMinute ?? sample.chatMessagesPerMinute),
    })).filter((sample) => sample.time && sample.viewers !== null && sample.messagesPerMinute !== null),
    events: liveData.events?.length ? liveData.events : report?.analytics?.notableMoments ?? base?.events ?? [],
  }
}

function csvCell(value) {
  const text = String(value ?? '')
  const safeText = /^\s*[=+\-@]/.test(text) ? `'${text}` : text
  return `"${safeText.replaceAll('"', '""')}"`
}

export function createSessionCsv(session) {
  const rows = [
    ['timestamp', 'viewers', 'messages_per_minute', 'stream_id', 'session_id', 'title', 'category'],
    ...(session?.samples ?? []).map((sample) => [
      sample.timestamp ?? sample.time,
      sample.viewers,
      sample.messagesPerMinute,
      session.streamId,
      session.sessionId,
      session.title,
      session.category,
    ]),
  ]
  return rows.map((row) => row.map(csvCell).join(',')).join('\n')
}

export function sessionExportFilename(session, extension) {
  const base = `${session?.date ?? 'session'}-${session?.title ?? session?.streamId ?? 'stream'}`
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
  return `${base || 'stream-session'}.${extension}`
}

export function createSessionReportHtml(session, reportLabels = 'Not available') {
  const labels = typeof reportLabels === 'string' ? { notAvailable: reportLabels } : reportLabels
  const notAvailable = labels.notAvailable ?? 'Not available'
  const label = (name, fallback) => labels[name] ?? fallback
  const available = (value) => value === null || value === undefined || value === '' ? notAvailable : value
  const list = (items, render) => items?.length
    ? `<ol>${items.slice(0, 10).map((item) => `<li>${render(item)}</li>`).join('')}</ol>`
    : `<p>${escapeHtml(notAvailable)}</p>`
  const samples = session?.samples ?? []
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(available(session?.title))}</title><style>body{font:16px/1.5 system-ui;max-width:960px;margin:40px auto;padding:0 24px;color:#172033}table{border-collapse:collapse;width:100%}th,td{border:1px solid #d7dce5;padding:8px;text-align:left}h1,h2{color:#101828}</style></head><body><h1>${escapeHtml(available(session?.title))}</h1><p>${escapeHtml(available(session?.date))} · ${escapeHtml(available(session?.category))}</p><h2>${escapeHtml(label('metrics', 'Metrics'))}</h2><ul><li>${escapeHtml(label('duration', 'Duration'))}: ${escapeHtml(available(session?.durationMinutes))}</li><li>${escapeHtml(label('averageViewers', 'Average viewers'))}: ${escapeHtml(available(session?.averageViewers))}</li><li>${escapeHtml(label('peakViewers', 'Peak viewers'))}: ${escapeHtml(available(session?.peakViewers))}</li><li>${escapeHtml(label('totalMessages', 'Total messages'))}: ${escapeHtml(available(session?.totalMessages))}</li><li>${escapeHtml(label('uniqueChatters', 'Unique chatters'))}: ${escapeHtml(available(session?.uniqueChatters))}</li><li>${escapeHtml(label('activityPeak', 'Activity peak'))}: ${escapeHtml(available(session?.activityPeak))}</li></ul><h2>${escapeHtml(label('topChatters', 'Top chatters'))}</h2>${list(session?.topChatters, (item) => `${escapeHtml(item.nickname)} — ${escapeHtml(item.messages ?? item.value ?? notAvailable)}`)}<h2>${escapeHtml(label('topWords', 'Top words'))}</h2>${list(session?.topWords, (item) => `${escapeHtml(item.text ?? item)} — ${escapeHtml(item.count ?? notAvailable)}`)}<h2>${escapeHtml(label('samples', 'Samples'))}</h2>${samples.length ? `<table><thead><tr><th>${escapeHtml(label('time', 'Time'))}</th><th>${escapeHtml(label('viewers', 'Viewers'))}</th><th>${escapeHtml(label('messagesPerMinute', 'Messages/min'))}</th></tr></thead><tbody>${samples.map((sample) => `<tr><td>${escapeHtml(sample.timestamp ?? sample.time)}</td><td>${escapeHtml(sample.viewers)}</td><td>${escapeHtml(sample.messagesPerMinute)}</td></tr>`).join('')}</tbody></table>` : `<p>${escapeHtml(notAvailable)}</p>`}</body></html>`
}

export function buildChatLeaderboards(chatAnalytics) {
  const messages = (chatAnalytics?.leaderboards?.messages ?? []).map((item) => ({
    nickname: item.nickname,
    value: Number(item.value) || 0,
    note: item.note,
  })).sort((first, second) => second.value - first.value)
  const observations = new Map()
  for (const message of chatAnalytics?.recentMessages ?? []) {
    const minute = minutesFromTime(message.time)
    if (!message.nickname || minute === null) continue
    const current = observations.get(message.nickname) ?? { first: minute, last: minute, count: 0 }
    current.first = Math.min(current.first, minute)
    current.last = Math.max(current.last, minute)
    current.count += 1
    observations.set(message.nickname, current)
  }
  const time = [...observations.entries()].map(([nickname, value]) => ({ nickname, value: value.last - value.first, count: value.count }))
    .sort((first, second) => second.value - first.value || second.count - first.count)
  const pace = [...observations.entries()].map(([nickname, value]) => ({
    nickname,
    value: Number((value.count / Math.max(1, value.last - value.first + 1)).toFixed(2)),
  })).sort((first, second) => second.value - first.value)
  const maxMessages = Math.max(1, ...messages.map((item) => item.value))
  const maxDuration = Math.max(1, ...time.map((item) => item.value))
  const engagement = messages.map((item) => {
    const observed = observations.get(item.nickname)
    const duration = observed ? observed.last - observed.first : 0
    const consistency = observed ? Math.min(1, observed.count / Math.max(1, duration + 1)) : 0
    return {
      nickname: item.nickname,
      value: Math.round((item.value / maxMessages) * 60 + (duration / maxDuration) * 25 + consistency * 15),
      calculated: true,
    }
  }).sort((first, second) => second.value - first.value)
  return { messages, time, pace, engagement }
}

export function createReplayScheduler({ schedule = setTimeout, cancel = clearTimeout } = {}) {
  let timer = null
  let active = false
  let runId = 0
  function stop() {
    runId += 1
    active = false
    if (timer !== null) cancel(timer)
    timer = null
  }
  function start(samples, speed, onFrame, onFinish) {
    if (
      active
      || !Array.isArray(samples)
      || samples.length < 2
      || !Number.isFinite(speed)
      || speed <= 0
      || typeof onFrame !== 'function'
    ) return false
    active = true
    const currentRun = ++runId
    let index = 0
    const advance = () => {
      if (!active || currentRun !== runId) return
      onFrame(samples[index], index, samples.length)
      index += 1
      if (index >= samples.length) {
        active = false
        timer = null
        onFinish?.()
        return
      }
      timer = schedule(advance, Math.max(50, 1_000 / speed))
    }
    advance()
    return true
  }
  return { start, stop, isActive: () => active }
}
