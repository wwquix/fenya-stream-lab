export const EMPTY_PANEL_VARIANTS = ['small', 'medium', 'large', 'chart']

export function normalizeEmptyPanelVariant(value) {
  return EMPTY_PANEL_VARIANTS.includes(value) ? value : 'medium'
}

const ROLE_BADGES = [
  ['isPlatformAdmin', 'rolePlatformAdmin'],
  ['isChannelOwner', 'roleChannelOwner'],
  ['isChannelAdmin', 'roleChannelAdmin'],
  ['isModerator', 'roleModerator'],
  ['isChatter', 'roleChatter'],
]

export function getRoleBadgeKeys(roleSummary) {
  const badges = ROLE_BADGES.filter(([flag]) => Boolean(roleSummary?.[flag])).map(([, labelKey]) => labelKey)
  return badges.some((key) => key !== 'roleChatter') ? badges.filter((key) => key !== 'roleChatter') : badges
}

export function normalizeRole(role) {
  const normalized = String(role || 'chatter').trim().toLowerCase()
  return ['platform_admin', 'channel_owner', 'moderator', 'chatter'].includes(normalized) ? normalized : 'chatter'
}

export function canControlIngest(role) {
  return ['platform_admin', 'channel_owner'].includes(normalizeRole(role))
}

export function resolveDashboardPermissions({ identity, dashboardMode, selectedChannel, legacyChannelLogin }) {
  if (!identity?.isLoggedIn) return { role: 'chatter', canControlIngest: false, readOnly: true }
  if (normalizeRole(identity.role) === 'platform_admin') {
    return { role: 'platform_admin', canControlIngest: true, readOnly: false }
  }

  let contextualRole = 'chatter'
  if (dashboardMode === 'connected-channel') {
    contextualRole = normalizeRole(
      selectedChannel?.role
      ?? identity.memberships?.find((membership) => membership.channelId === selectedChannel?.id)?.role,
    )
  } else if (dashboardMode === 'legacy-fenya') {
    const isLinkedReader = identity.ingestChannels?.some((channel) => (
      channel.twitchLogin?.toLowerCase() === String(legacyChannelLogin || 'fenya').toLowerCase()
    ))
    if (isLinkedReader) return { role: 'ingest_reader', canControlIngest: true, readOnly: false }
    contextualRole = normalizeRole(identity.memberships?.find((membership) => (
      membership.channelLogin?.toLowerCase() === String(legacyChannelLogin || 'fenya').toLowerCase()
    ))?.role)
  }

  const controlAllowed = canControlIngest(contextualRole)
  return { role: contextualRole, canControlIngest: controlAllowed, readOnly: !controlAllowed }
}

export function formatDashboardModeLabel(mode, login, t) {
  if (mode === 'connected-channel') return `${t.modePrefix}: ${t.myChannelMode} @${login || '—'}`
  if (mode === 'legacy-fenya') return `${t.modePrefix}: Fenya legacy`
  return `${t.modePrefix}: demo`
}

export function formatDashboardModeDescription(mode, login, t) {
  if (mode === 'connected-channel') return `${formatDashboardModeLabel(mode, login, t)} — ${t.connectedChannelModeDescription}`
  if (mode === 'legacy-fenya') return `${formatDashboardModeLabel(mode, login, t)} — ${t.legacyModeDescription}`
  return formatDashboardModeLabel(mode, login, t)
}

export function formatDataSourceDescription(mode, login, t) {
  if (mode === 'connected-channel') return t.connectedDataSourceDescription.replace('{login}', login || '—')
  if (mode === 'legacy-fenya') return t.legacyDataSourceDescription
  return t.mockDataSourceDescription
}

export function getVodRowPresentation(vod, t) {
  const hasAnalytics = Boolean(vod?.hasInternalAnalytics)
  return {
    statusLabel: hasAnalytics ? t.vodHasAnalytics : t.vodOnly,
    statusClassName: hasAnalytics ? 'vod-analytics-pill has-analytics' : 'vod-analytics-pill',
    actionLabel: t.vodOpenTwitch,
  }
}

export function isKnownFrontendPath(pathname) {
  return pathname === '/' || pathname === '/index.html'
}

export function isBackendUnavailable({ identityError, ingestError, connection, status }) {
  return Boolean(identityError && ingestError && !connection && !status)
}

export function hasCollectionGap(streamStartedAt, collectedFrom) {
  const streamStart = Date.parse(streamStartedAt)
  const collectionStart = Date.parse(collectedFrom)
  return Number.isFinite(streamStart) && Number.isFinite(collectionStart) && streamStart < collectionStart
}

export function normalizeTwitchThumbnailUrl(value, width = 320, height = 180) {
  if (typeof value !== 'string' || !value.trim()) return null
  return value.trim()
    .replaceAll('%{width}', String(width))
    .replaceAll('%{height}', String(height))
    .replaceAll('{width}', String(width))
    .replaceAll('{height}', String(height))
}

export function resolveInitialTheme(storedTheme) {
  return storedTheme === 'light' ? 'light' : 'dark'
}
