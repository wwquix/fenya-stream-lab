import { useEffect, useRef } from 'react'

function SettingsPanel({ theme, onToggleTheme, onClose, t, children }) {
  const closeButtonRef = useRef(null)
  const panelRef = useRef(null)
  const themeLabel = theme === 'light' ? t.switchToDarkTheme : t.switchToLightTheme

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()

    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab') return

      const focusableElements = [...(panelRef.current?.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [])]

      if (focusableElements.length === 0) {
        event.preventDefault()
        return
      }

      const firstElement = focusableElements[0]
      const lastElement = focusableElements.at(-1)

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault()
        lastElement.focus()
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault()
        firstElement.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  return (
    <div className="settings-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section ref={panelRef} className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header className="settings-header">
          <div>
            <p className="eyebrow">{t.settingsKicker}</p>
            <h2 id="settings-title">{t.settingsTitle}</h2>
            <p>{t.settingsNote}</p>
          </div>
          <button ref={closeButtonRef} className="button button-tertiary settings-close" type="button" onClick={onClose}>
            <span aria-hidden="true">×</span>
            <span className="sr-only">{t.closeSettings}</span>
          </button>
        </header>

        <section className="settings-theme-card" aria-labelledby="settings-theme-title">
          <div>
            <span className="settings-theme-preview" aria-hidden="true" />
            <div>
              <h3 id="settings-theme-title">{t.settingsThemeTitle}</h3>
              <p>{t.settingsThemeNote}</p>
            </div>
          </div>
          <button className="button button-secondary" type="button" onClick={onToggleTheme}>
            {themeLabel}
          </button>
        </section>

        <div className="settings-content">
          {children}
        </div>
      </section>
    </div>
  )
}

export default SettingsPanel
