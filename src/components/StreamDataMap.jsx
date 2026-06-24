const dataSources = [
  {
    id: 'timeline',
    title: 'Stream Timeline',
    provides: 'Viewer count, category segments, session duration',
    future: 'Streaming platform API later',
  },
  {
    id: 'chat',
    title: 'Chat Messages',
    provides: 'Message volume, top chatters, repeat phrases',
    future: 'Live chat ingestion later',
  },
  {
    id: 'moderation',
    title: 'Moderation Actions',
    provides: 'Bans, timeouts, unbans, reaction time',
    future: 'Moderator audit log later',
  },
  {
    id: 'speech',
    title: 'Speech Transcript',
    provides: 'Word frequency and phrase patterns',
    future: 'Transcript pipeline later',
  },
  {
    id: 'archive',
    title: 'Stream Archive',
    provides: 'Past sessions, dominant words, peak moments',
    future: 'Persistent catalog later',
  },
]

function StreamDataMap() {
  return (
    <section className="section-panel stream-data-map data-sources" id="data-pipeline" aria-labelledby="stream-data-map-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">analysis pipeline</p>
          <h2 id="stream-data-map-title">Data Sources</h2>
          <p className="section-note">What the current demo data represents, and where each source can connect later.</p>
        </div>
      </div>

      <div className="data-source-grid">
        {dataSources.map((source) => (
          <article className="data-source-card glass-panel" key={source.id}>
            <span>demo data</span>
            <strong>{source.title}</strong>
            <p>{source.provides}</p>
            <small>{source.future}</small>
          </article>
        ))}
      </div>
    </section>
  )
}

export default StreamDataMap
