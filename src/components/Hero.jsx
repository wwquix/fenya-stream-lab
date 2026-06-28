import { Reveal } from './MotionPrimitives.jsx'

// Future media swap point:
// import heroBackground from '../assets/hero-background.webp'
// const heroAsset = { src: heroBackground, alt: 'Abstract stream analytics background' }
const defaultHeroAsset = {
  src: null,
  alt: 'Abstract stream analytics background',
}

const navItems = [
  { id: 'hero', labelKey: 'navTop' },
  { id: 'stream-pulse', labelKey: 'navPulse' },
  { id: 'chatters', labelKey: 'navChatters' },
  { id: 'speech', labelKey: 'navSpeech' },
  { id: 'moderators', labelKey: 'navMods' },
  { id: 'archive', labelKey: 'navArchive' },
  { id: 'summary', labelKey: 'navSummary' },
]

function Hero({ stream, heroAsset = defaultHeroAsset, activeSection = 'hero', language, onToggleLanguage, t }) {
  const hasHeroAsset = Boolean(heroAsset?.src)

  return (
    <Reveal as="section" className="hero-wrap" id="hero" data-entity-type="stream" data-entity-id={stream.id}>
      <div className="hero-section">
        <div className="hero-background-slot" aria-label={heroAsset.alt}>
          {hasHeroAsset ? <img src={heroAsset.src} alt={heroAsset.alt} /> : null}
        </div>
        <div className="hero-cinematic-layer" aria-hidden="true" />
        <div className="hero-noise-layer" aria-hidden="true" />

        <nav className="hero-navbar" aria-label="Primary">
          <a className="hero-logo" href="#hero" aria-label="Fenya Stream Lab home">
            Fenya Lab
          </a>
          <div className="hero-nav-menu">
            {navItems.map((item) => (
              <a className={activeSection === item.id ? 'is-active' : ''} href={`#${item.id}`} key={item.id}>
                {t[item.labelKey]}
              </a>
            ))}
          </div>
          <div className="hero-nav-actions">
            <button className="language-toggle liquid-button" type="button" onClick={onToggleLanguage} aria-label="Switch language">
              {language === 'ru' ? 'RU' : 'EN'}
            </button>
            <a className="hero-nav-cta liquid-button" href="#stream-pulse">
              {t.viewDashboard} <span aria-hidden="true">↗</span>
            </a>
          </div>
        </nav>

        <div className="hero-copy">
          <p className="hero-badge">
            <span aria-hidden="true" />
            {t.heroBadge}
          </p>
          <h1>Fenya Stream Lab</h1>
        </div>
      </div>
    </Reveal>
  )
}

export default Hero
