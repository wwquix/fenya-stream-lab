import { normalizeEmptyPanelVariant } from '../utils/dashboardUi.js'

export default function EmptyPanel({ title = null, message, detail = null, action = null, compact = false, minHeight = 'medium', className = '' }) {
  const variant = normalizeEmptyPanelVariant(minHeight)
  return (
    <div className={`empty-panel empty-panel-${variant} ${compact ? 'is-compact' : ''} ${className}`.trim()} role="status">
      <div className="empty-panel-copy">
        {title ? <strong>{title}</strong> : null}
        <p>{message}</p>
        {detail ? <span>{detail}</span> : null}
      </div>
      {action ? <div className="empty-panel-action">{action}</div> : null}
    </div>
  )
}
