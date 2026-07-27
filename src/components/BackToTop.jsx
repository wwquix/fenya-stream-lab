function BackToTop({ isVisible }) {
  function handleClick(event) {
    const target = document.getElementById('top')
    if (!target) return
    event.preventDefault()
    target.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    })
    window.history.replaceState(null, '', '#top')
  }

  return (
    <a className={`back-to-top liquid-glass liquid-surface-elevated liquid-control ${isVisible ? 'is-visible' : ''}`} href="#top" aria-label="Back to top" tabIndex={isVisible ? 0 : -1} onClick={handleClick}>
      ↑
    </a>
  )
}

export default BackToTop
