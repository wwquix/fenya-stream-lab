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
  return ROLE_BADGES.filter(([flag]) => Boolean(roleSummary?.[flag])).map(([, labelKey]) => labelKey)
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
