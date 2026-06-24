function FloatingStats({ metrics }) {
  return (
    <div className="floating-stats" aria-label="Key stream metrics">
      {metrics.map((metric, index) => (
        <article className={`floating-stat glass-panel ${metric.isPrimary ? 'is-primary' : ''}`} style={{ '--float-delay': `${index * 0.35}s` }} key={metric.id}>
          <span>{metric.label}</span>
          <strong>{metric.value}</strong>
        </article>
      ))}
    </div>
  )
}

export default FloatingStats
