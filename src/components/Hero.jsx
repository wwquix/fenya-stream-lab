import { Reveal } from './MotionPrimitives.jsx'

// Future media swap point:
// import heroBackground from '../assets/hero-background.webp'
// const heroAsset = { src: heroBackground, alt: 'Abstract stream analytics background' }
const defaultHeroAsset = {
  src: null,
  alt: 'Abstract stream analytics background',
}

const navItems = [
  { id: 'dashboard', labelKey: 'navDashboard', sections: ['top', 'summary', 'pulse'] },
  { id: 'insights', labelKey: 'navAnalytics', sections: ['insights', 'chatters', 'moderators', 'words'] },
  { id: 'archive', labelKey: 'navArchive', sections: ['archive'] },
]

function Hero({
  stream,
  heroAsset = defaultHeroAsset,
  activeSection = 'top',
  language,
  onToggleLanguage,
  onOpenSettings,
  settingsOpen = false,
  settingsTriggerRef,
  t,
}) {
  const hasHeroAsset = Boolean(heroAsset?.src)

  return (
    <Reveal as="section" className="hero-wrap" id="top" data-entity-type="stream" data-entity-id={stream.id}>
      <div className="hero-section">
        <div className="hero-background-slot" aria-label={heroAsset.alt}>
          {hasHeroAsset ? <img src={heroAsset.src} alt={heroAsset.alt} /> : null}
        </div>
        <div className="hero-cinematic-layer" aria-hidden="true" />
        <div className="hero-noise-layer" aria-hidden="true" />

        <nav className="hero-navbar liquid-glass liquid-surface-elevated" aria-label="Primary" data-liquid-interactive>
          <a className="hero-logo" href="#top" aria-label="Fenya Stream Lab home">
            Fenya Lab
          </a>
          <div className="hero-nav-menu">
            {navItems.map((item) => (
              <a className={item.sections.includes(activeSection) && !settingsOpen ? 'is-active' : ''} href={`#${item.id}`} key={item.id}>
                <span className="hero-nav-label">{t[item.labelKey]}</span>
              </a>
            ))}
            <button
              ref={settingsTriggerRef}
              className={settingsOpen ? 'is-active' : ''}
              type="button"
              aria-haspopup="dialog"
              aria-expanded={settingsOpen}
              onClick={onOpenSettings}
            >
              <span className="hero-nav-label">{t.navSettings}</span>
            </button>
          </div>
          <div className="hero-nav-actions">
            <button className="language-toggle button button-secondary" type="button" onClick={onToggleLanguage} aria-label="Switch language">
              {language === 'ru' ? 'RU' : 'EN'}
            </button>
          </div>
        </nav>

        <div className="hero-copy">
          <h1>Fenya Stream Lab</h1>
          <a className="button button-tertiary hero-primary-action" href="#dashboard">{t.viewDashboard}</a>
        </div>
      </div>
    </Reveal>
  )
}

export default Hero
