function BackToTop({ isVisible }) {
  return (
    <a className={`back-to-top liquid-glass liquid-surface-elevated liquid-control ${isVisible ? 'is-visible' : ''}`} href="#top" aria-label="Back to top" tabIndex={isVisible ? 0 : -1}>
      ↑
    </a>
  )
}

export default BackToTop
