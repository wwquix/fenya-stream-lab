const railItems = [
  { id: 'top', labelKey: 'navTop' },
  { id: 'pulse', labelKey: 'navPulse' },
  { id: 'insights', labelKey: 'navInsights' },
  { id: 'chatters', labelKey: 'navChatters' },
  { id: 'words', labelKey: 'navSpeech' },
  { id: 'moderators', labelKey: 'navMods' },
  { id: 'archive', labelKey: 'navArchive' },
  { id: 'summary', labelKey: 'navSummary' },
  { id: 'import', labelKey: 'navImport' },
]

function SectionRail({ activeSection = 'top', availableSectionIds = [], isVisible = false, t }) {
  const availableSections = new Set(availableSectionIds)

  function handleSectionClick(event, sectionId) {
    const target = document.getElementById(sectionId)
    if (!target) return
    event.preventDefault()
    target.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    })
    window.history.replaceState(null, '', `#${sectionId}`)
  }

  return (
    <nav className={`section-rail ${isVisible ? 'is-visible' : ''}`} aria-label="Page sections" aria-hidden={!isVisible}>
      {railItems.filter((item) => availableSections.has(item.id)).map((item) => (
        <a className={activeSection === item.id ? 'is-active' : ''} href={`#${item.id}`} key={item.id} tabIndex={isVisible ? 0 : -1} onClick={(event) => handleSectionClick(event, item.id)}>
          <span aria-hidden="true" />
          <strong>{t[item.labelKey]}</strong>
        </a>
      ))}
    </nav>
  )
}

export default SectionRail
