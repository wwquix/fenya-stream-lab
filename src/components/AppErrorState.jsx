export default function AppErrorState({ title, message, actionLabel = null, onAction = null, href = null, compact = false }) {
  const Heading = compact ? 'h2' : 'h1'

  return (
    <section className={`app-error-state liquid-glass liquid-surface ${compact ? 'is-compact' : ''}`} role="alert">
      <span className="app-error-code" aria-hidden="true">FSL</span>
      <div>
        <Heading>{title}</Heading>
        <p>{message}</p>
      </div>
      {actionLabel && href ? <a className="liquid-button app-error-action" href={href}>{actionLabel}</a> : null}
      {actionLabel && onAction ? <button className="liquid-button app-error-action" type="button" onClick={onAction}>{actionLabel}</button> : null}
    </section>
  )
}
