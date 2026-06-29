const railItems = [
  { id: 'hero', labelKey: 'navTop' },
  { id: 'stream-pulse', labelKey: 'navPulse' },
  { id: 'chatters', labelKey: 'navChatters' },
  { id: 'speech', labelKey: 'navSpeech' },
  { id: 'moderators', labelKey: 'navMods' },
  { id: 'archive', labelKey: 'navArchive' },
  { id: 'summary', labelKey: 'navSummary' },
  { id: 'import-data', labelKey: 'navImport' },
]

function SectionRail({ activeSection = 'hero', isVisible = false, t }) {
  return (
    <nav className={`section-rail ${isVisible ? 'is-visible' : ''}`} aria-label="Page sections" aria-hidden={!isVisible}>
      {railItems.map((item) => (
        <a className={activeSection === item.id ? 'is-active' : ''} href={`#${item.id}`} key={item.id} tabIndex={isVisible ? 0 : -1}>
          <span aria-hidden="true" />
          <strong>{t[item.labelKey]}</strong>
        </a>
      ))}
    </nav>
  )
}

export default SectionRail
