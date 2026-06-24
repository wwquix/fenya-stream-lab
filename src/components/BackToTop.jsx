function BackToTop({ isVisible }) {
  return (
    <a className={`back-to-top ${isVisible ? 'is-visible' : ''}`} href="#hero" aria-label="Back to top" tabIndex={isVisible ? 0 : -1}>
      ↑
    </a>
  )
}

export default BackToTop
