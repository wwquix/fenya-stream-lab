import EmptyPanel from './EmptyPanel.jsx'
import { getVodRowPresentation, normalizeExternalHttpUrl, normalizeTwitchThumbnailUrl } from '../utils/dashboardUi.js'

function formatVodDate(value, russian) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(russian ? 'ru-RU' : 'en-US', { dateStyle: 'medium' }).format(date)
}

function formatTotalDuration(seconds, russian) {
  const totalHours = Math.floor(Number(seconds || 0) / 3600)
  const minutes = Math.floor((Number(seconds || 0) % 3600) / 60)
  return russian ? `${totalHours} ч ${minutes} мин` : `${totalHours}h ${minutes}m`
}

export default function TwitchVodArchive({ archive, canSync, dashboardMode = 'legacy-fenya', t }) {
  const russian = t.navTop === 'Топ'
  const comparison = archive?.comparison

  return (
    <div className="twitch-vod-archive">
      <div className="vod-archive-heading">
        <div>
          <p className="eyebrow">Twitch VOD</p>
          <h3>{t.vodArchiveTitle}</h3>
          <p className="section-note">{t.vodArchiveNote}</p>
        </div>
        {canSync ? <button className="liquid-button vod-sync-button" type="button" disabled={archive?.isSyncing} onClick={() => archive.sync().catch(() => {})}>{archive?.isSyncing ? t.vodSyncing : t.vodSync}</button> : null}
      </div>
      {archive?.syncedCount !== null && archive?.syncedCount !== undefined ? (
        <p className="section-note vod-sync-result" role="status">{t.vodSyncedCount}: {archive.syncedCount} VOD</p>
      ) : null}
      {archive?.error ? <p className="twitch-status-error" role="alert">{archive.error.message}</p> : null}
      {(comparison?.totalVods || archive?.vods?.length) ? (
        <dl className="vod-summary glass-panel">
          <div><dt>{t.vodSyncedTotal}</dt><dd>{comparison?.totalVods ?? archive.vods.length}</dd></div>
          <div><dt>{t.vodTotalDuration}</dt><dd>{formatTotalDuration(comparison?.totalDurationSeconds, russian)}</dd></div>
          <div><dt>{t.vodTopViews}</dt><dd>{comparison?.topVod?.viewCount ?? 0}</dd></div>
        </dl>
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
          {archive.vods.map((vod) => {
            const row = getVodRowPresentation(vod, t)
            const vodUrl = normalizeExternalHttpUrl(vod.url)
            const vodThumbnailUrl = normalizeTwitchThumbnailUrl(vod.thumbnailUrl)
            return (
            <article className="vod-list-row glass-panel" key={vod.twitchVideoId} role="listitem">
              <div className="vod-list-thumbnail">
                {vodThumbnailUrl ? <img src={vodThumbnailUrl} alt="" loading="lazy" /> : <span aria-hidden="true">VOD</span>}
              </div>
              <h4 className="vod-list-title">{vod.title}</h4>
              <span className="vod-list-value">{formatVodDate(vod.createdAt, russian)}</span>
              <span className="vod-list-value">{vod.duration || '—'}</span>
              <span className="vod-list-value">{vod.viewCount ?? 0}</span>
              <span className={row.statusClassName}>{row.statusLabel}</span>
              {vodUrl
                ? <a className="vod-list-open" href={vodUrl} target="_blank" rel="noreferrer">{row.actionLabel}</a>
                : <span className="vod-list-open is-disabled" aria-disabled="true">{row.actionLabel}</span>}
            </article>
            )
          })}
        </div>
      ) : archive?.hasLoaded ? (
        <EmptyPanel
          message={t.vodNoResults}
          detail={dashboardMode === 'connected-channel' ? t.vodLegacyHint : null}
          minHeight="medium"
          action={canSync ? <button className="liquid-button" type="button" disabled={archive?.isSyncing} onClick={() => archive.sync().catch(() => {})}>{archive?.isSyncing ? t.vodSyncing : t.vodSync}</button> : null}
        />
      ) : (
        <EmptyPanel
          message={t.vodNotSynced}
          minHeight="medium"
          action={canSync ? <button className="liquid-button" type="button" disabled={archive?.isSyncing} onClick={() => archive.sync().catch(() => {})}>{archive?.isSyncing ? t.vodSyncing : t.vodSync}</button> : null}
        />
      )}
    </div>
  )
}
