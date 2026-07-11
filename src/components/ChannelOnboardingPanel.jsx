import { useCallback, useEffect, useState } from 'react'
import { Reveal } from './MotionPrimitives.jsx'
import { formatDataSourceDescription, getRoleBadgeKeys } from '../utils/dashboardUi.js'

function ChannelOnboardingPanel({ t, identity, dashboardMode = 'mock', selectedChannel = null, legacyChannelLogin = 'fenya', canConnectChannel = false, permissions = null, onIdentityRefresh, onOpenChannel, onOpenLegacy }) {
  const [channels, setChannels] = useState([])
  const [state, setState] = useState('loading')
  const [message, setMessage] = useState(t.channelLoading)

  const loadChannels = useCallback(async () => {
    try {
      const response = await fetch('/api/channels/mine')
      if (response.status === 401) {
        setState('guest')
        setMessage(t.channelLoginRequired)
        return
      }
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.message || t.channelLoadError)
      setChannels(Array.isArray(payload.channels) ? payload.channels : [])
      setState('ready')
      setMessage(payload.channels?.length ? t.channelConnectedNote : t.channelEmptyNote)
    } catch {
      setState('error')
      setMessage(t.channelLoadError)
    }
  }, [t])

  useEffect(() => {
    const initialLoad = window.setTimeout(loadChannels, 0)
    return () => window.clearTimeout(initialLoad)
  }, [loadChannels])

  async function startTwitchLogin(forceVerify = false) {
    setState('connecting')
    setMessage(t.channelStartingLogin)
    try {
      const response = await fetch(`/auth/twitch/login?format=json${forceVerify ? '&reauth=1' : ''}`)
      const payload = await response.json()
      if (!response.ok || !payload.authorizationUrl) {
        throw new Error(payload.message || t.channelConnectError)
      }
      window.location.assign(payload.authorizationUrl)
    } catch (error) {
      setState('error')
      setMessage(error.message || t.channelConnectError)
    }
  }

  async function handleConnect() {
    if (state === 'guest') {
      await startTwitchLogin()
      return
    }
    if (state === 'connecting') return
    setState('connecting')
    setMessage(t.channelConnecting)
    try {
      const response = await fetch('/api/channels/connect-my-channel', { method: 'POST' })
      if (response.status === 401) {
        await startTwitchLogin()
        return
      }
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.message || t.channelConnectError)
      await loadChannels()
      await onIdentityRefresh?.()
    } catch {
      setState('error')
      setMessage(t.channelConnectError)
    }
  }

  function connectChatReader() {
    window.location.assign(`/auth/twitch/login?purpose=ingest&channel=${encodeURIComponent(legacyChannelLogin)}&reauth=1`)
  }

  return (
    <Reveal as="section" className="section-panel channel-onboarding" aria-labelledby="channel-onboarding-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{t.channelOnboardingKicker}</p>
          <h2 id="channel-onboarding-title">{t.channelOnboardingTitle}</h2>
        </div>
      </div>

      <div className="channel-onboarding-toolbar glass-panel">
        <div className="account-identity" aria-live="polite">
          {identity?.twitchAccount?.profileImageUrl ? <img src={identity.twitchAccount.profileImageUrl} alt="" /> : null}
          <div>
            <div className="account-identity-heading">
              <strong>{identity?.isLoggedIn && identity.twitchAccount ? `@${identity.twitchAccount.login}` : message}</strong>
              {identity?.roleSummary ? (
                <div className="identity-role-badges" aria-label={t.rolesLabel}>
                  {getRoleBadgeKeys(identity.roleSummary).map((labelKey) => (
                    <span key={labelKey} title={labelKey === 'rolePlatformAdmin' ? t.platformAdminHint : undefined}>{t[labelKey]}</span>
                  ))}
                </div>
              ) : null}
            </div>
            <span>{identity?.user?.displayName || t.channelConnectHint}</span>
            {identity?.isLoggedIn && identity.twitchAccount ? (
              <span className="role-helper">{t.rolesAutomaticHint}</span>
            ) : null}
            {identity?.isLoggedIn && permissions ? (
              <span className={`account-access-state ${permissions.readOnly ? 'is-read-only' : 'can-control'}`}>
                {permissions.readOnly ? t.viewMode : t.controlAvailable}
              </span>
            ) : null}
          </div>
        </div>
        {state === 'guest' || (channels.length === 0 && canConnectChannel) ? <button className="liquid-button channel-connect-button" type="button" disabled={state === 'loading' || state === 'connecting'} onClick={handleConnect}>
          {state === 'connecting' ? t.channelConnecting : t.connectMyTwitchChannel}
        </button> : null}
        {dashboardMode === 'legacy-fenya' ? (
          <div>
            <button className="liquid-button channel-connect-button" type="button" onClick={connectChatReader}>{t.connectChatReader}</button>
            <span className="role-helper">{t.connectChatReaderHint}</span>
          </div>
        ) : null}
      </div>

      <div className="identity-mode-row">
        <div className="data-source-copy">
          <strong>{t.dataSourceLabel}</strong>
          <p>{formatDataSourceDescription(dashboardMode, selectedChannel?.twitchLogin || identity?.twitchAccount?.login, t)}</p>
        </div>
        <div className="dashboard-mode-actions" aria-label={t.dataSourceLabel}>
          <button className={`liquid-button ${dashboardMode === 'legacy-fenya' ? 'is-active' : ''}`} type="button" aria-pressed={dashboardMode === 'legacy-fenya'} onClick={onOpenLegacy}>{t.openLegacyMode}</button>
          {channels[0] ? <button className={`liquid-button ${dashboardMode === 'connected-channel' ? 'is-active' : ''}`} type="button" aria-pressed={dashboardMode === 'connected-channel'} onClick={() => onOpenChannel?.(channels[0])}>{t.openMyChannelMode} @{channels[0].twitchLogin}</button> : null}
        </div>
      </div>

      {channels.length ? (
        <div className="connected-channel-grid">
          {channels.map((channel) => (
            <article className="connected-channel-card glass-panel" key={channel.id}>
              <div>
                <h3>@{channel.twitchLogin}</h3>
                <p><span className={`channel-status-dot is-${channel.ingest?.status || 'stopped'}`} />{channel.ingest?.running ? t.channelStatusRunning : t.channelStatusReady}</p>
                {channel.needsReauth ? <p className="channel-reauth-note" role="status">{channel.message || t.channelReauthMessage}</p> : null}
              </div>
              {channel.needsReauth ? (
                <button className="channel-dashboard-link" type="button" disabled={state === 'connecting'} onClick={() => startTwitchLogin(true)}>{t.channelReconnectTwitch}</button>
              ) : <button className="channel-dashboard-link" type="button" onClick={() => onOpenChannel?.(channel)}>{t.openChannelCompact}</button>}
            </article>
          ))}
        </div>
      ) : null}
    </Reveal>
  )
}

export default ChannelOnboardingPanel
