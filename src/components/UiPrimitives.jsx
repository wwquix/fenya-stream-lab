function StatusIcon({ variant }) {
  const paths = {
    success: <path d="m5 12 4 4L19 6" />,
    warning: <><path d="M12 4 3 20h18L12 4Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></>,
    error: <><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6M15 9l-6 6" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></>,
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {paths[variant] ?? paths.info}
    </svg>
  )
}

export function StatusBanner({ variant = 'info', title = null, children, className = '', action = null }) {
  return (
    <aside
      className={`status-banner is-${variant} ${className}`.trim()}
      role={variant === 'error' ? 'alert' : 'status'}
      aria-live={variant === 'error' ? 'assertive' : 'polite'}
    >
      <span className="status-banner-icon"><StatusIcon variant={variant} /></span>
      <div className="status-banner-copy">
        {title ? <strong>{title}</strong> : null}
        {typeof children === 'string' ? <p>{children}</p> : children}
      </div>
      {action ? <div className="status-banner-action">{action}</div> : null}
    </aside>
  )
}

export function MetricCard({ label, value, detail = null, emptyLabel = '—', className = '', children = null }) {
  const unavailableText = typeof value === 'string' && (value.includes('Нет данных') || value.includes('Not available'))
  const unavailable = value === null || value === undefined || value === '' || unavailableText
  const displayValue = unavailableText ? value : unavailable ? emptyLabel : value

  return (
    <article className={`metric-card liquid-inner-surface ${unavailable ? 'is-unavailable' : ''} ${className}`.trim()}>
      <span className="metric-card-label">{label}</span>
      <strong className="metric-card-value">{children ?? displayValue}</strong>
      {detail ? <small className="metric-card-detail">{detail}</small> : null}
    </article>
  )
}

export function SegmentedControl({ label, children, className = '', role = 'group' }) {
  return (
    <div className={`segmented-control ${className}`.trim()} role={role} aria-label={label}>
      {children}
    </div>
  )
}
