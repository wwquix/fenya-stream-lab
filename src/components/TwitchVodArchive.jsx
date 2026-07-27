import { useState } from 'react'
import EmptyPanel from './EmptyPanel.jsx'
import { MetricCard, StatusBanner } from './UiPrimitives.jsx'
import { getVodRowPresentation } from '../utils/dashboardUi.js'

export const INITIAL_VOD_LIMIT = 10

function formatVodDate(value, russian) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(russian ? 'ru-RU' : 'en-US', { dateStyle: 'medium' }).format(date)
}

function thumbnailUrl(value) {
  return value?.replace('%{width}', '320').replace('%{height}', '180')
}

function formatTotalDuration(seconds, russian) {
  if (seconds === null || seconds === undefined || !Number.isFinite(Number(seconds))) return null
  const totalHours = Math.floor(Number(seconds) / 3600)
  const minutes = Math.floor((Number(seconds) % 3600) / 60)
  return russian ? `${totalHours} ч ${minutes} мин` : `${totalHours}h ${minutes}m`
}

function VodThumbnail({ value }) {
  const resolvedUrl = thumbnailUrl(value)
  const [failedUrl, setFailedUrl] = useState(null)
  const hasFailed = !resolvedUrl || failedUrl === resolvedUrl

  if (hasFailed) {
    return (
      <span className="vod-fallback-thumbnail" aria-hidden="true">
        <strong>FSL</strong>
        <small>Twitch VOD</small>
      </span>
    )
  }

  return <img src={resolvedUrl} alt="" loading="lazy" onError={() => setFailedUrl(resolvedUrl)} />
}

export default function TwitchVodArchive({ archive, canSync, dashboardMode = 'legacy-fenya', t }) {
  const russian = t.navTop === 'Топ'
  const comparison = archive?.comparison
  const [showAllVods, setShowAllVods] = useState(false)
  const vods = archive?.vods ?? []
  const visibleVods = showAllVods ? vods : vods.slice(0, INITIAL_VOD_LIMIT)

  return (
    <div className="twitch-vod-archive">
      <div className="vod-archive-heading">
        <div>
          <h3>{t.vodArchiveTitle}</h3>
        </div>
        {canSync ? <button className="button button-primary vod-sync-button" type="button" disabled={archive?.isSyncing} onClick={() => archive.sync().catch(() => {})}>{archive?.isSyncing ? t.vodSyncing : t.vodSync}</button> : null}
      </div>
      {archive?.syncedCount !== null && archive?.syncedCount !== undefined ? (
        <StatusBanner className="vod-sync-result" variant="success">{t.vodSyncedCount}: {archive.syncedCount} VOD</StatusBanner>
      ) : null}
      {archive?.error ? <StatusBanner variant="error">{archive.error.message}</StatusBanner> : null}
      {(comparison?.totalVods || archive?.vods?.length) ? (
        <div className="vod-summary glass-panel">
          <MetricCard label={t.vodSyncedTotal} value={comparison?.totalVods ?? archive.vods.length} emptyLabel={t.notAvailable} />
          <MetricCard label={t.vodTotalDuration} value={formatTotalDuration(comparison?.totalDurationSeconds, russian)} emptyLabel={t.notAvailable} />
          <MetricCard label={t.vodTopViews} value={comparison?.topVod?.viewCount ?? null} emptyLabel={t.notAvailable} />
        </div>
      ) : null}
      {archive?.isLoading ? <EmptyPanel message={t.channelLoading} minHeight="medium" compact /> : archive?.vods?.length ? (
        <div className="vod-list" role="list">
          <div className="vod-list-head" aria-hidden="true">
            <span />
            <span>{t.vodColumnTitle}</span>
            <span>{t.vodColumnDate}</span>
            <span>{t.duration}</span>
            <span>{t.vodViews}</span>
            <span>{t.vodColumnStatus}</span>
            <span>{t.vodColumnAction}</span>
          </div>
          {visibleVods.map((vod) => {
            const row = getVodRowPresentation(vod, t)
            return (
            <article className="vod-list-row glass-panel" key={vod.twitchVideoId} role="listitem">
              <div className="vod-list-thumbnail">
                <VodThumbnail value={vod.thumbnailUrl} />
              </div>
              <h4 className="vod-list-title">{vod.title}</h4>
              <span className="vod-list-value">{formatVodDate(vod.createdAt, russian)}</span>
              <span className="vod-list-value">{vod.duration || '—'}</span>
              <span className="vod-list-value">{vod.viewCount ?? '—'}</span>
              <span className={row.statusClassName}>{row.statusLabel}</span>
              <a className="button button-tertiary vod-list-open" href={vod.url} target="_blank" rel="noreferrer">{row.actionLabel}</a>
            </article>
            )
          })}
          {vods.length > INITIAL_VOD_LIMIT ? (
            <button className="button button-secondary vod-list-more" type="button" onClick={() => setShowAllVods((value) => !value)}>
              {showAllVods ? t.showLess : `${t.showMore} · ${vods.length - INITIAL_VOD_LIMIT}`}
            </button>
          ) : null}
        </div>
      ) : archive?.hasLoaded ? (
        <EmptyPanel
          message={t.vodNoResults}
          detail={dashboardMode === 'connected-channel' ? t.vodLegacyHint : null}
          minHeight="medium"
          action={canSync ? <button className="button button-primary" type="button" disabled={archive?.isSyncing} onClick={() => archive.sync().catch(() => {})}>{archive?.isSyncing ? t.vodSyncing : t.vodSync}</button> : null}
        />
      ) : (
        <EmptyPanel
          message={t.vodNotSynced}
          minHeight="medium"
          action={canSync ? <button className="button button-primary" type="button" disabled={archive?.isSyncing} onClick={() => archive.sync().catch(() => {})}>{archive?.isSyncing ? t.vodSyncing : t.vodSync}</button> : null}
        />
      )}
    </div>
  )
}
