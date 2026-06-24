const quickLinks = [
  { href: '#stream-pulse', label: 'Stream Pulse' },
  { href: '#chatters', label: 'Chatters' },
  { href: '#speech', label: 'Speech' },
  { href: '#moderators', label: 'Moderators' },
  { href: '#archive', label: 'Archive' },
  { href: '#summary', label: 'Summary' },
]

function QuickAccessNav({ activeSection = 'summary' }) {
  return (
    <nav className="quick-access-nav" aria-label="Dashboard sections">
      {quickLinks.map((link) => (
        <a className={activeSection === link.href.slice(1) ? 'is-active' : ''} href={link.href} key={link.href}>
          {link.label}
        </a>
      ))}
    </nav>
  )
}

export default QuickAccessNav
