import { useMemo, useState } from 'react'
import ScannerTooltip from './ScannerTooltip.jsx'

function ExperimentsArena({ chatters }) {
  const arenaChatters = useMemo(() => chatters.slice(0, 10), [chatters])
  const [winnerId, setWinnerId] = useState(null)

  function startExperiment() {
    const winner = arenaChatters[Math.floor(Math.random() * arenaChatters.length)]
    setWinnerId(winner.id)
  }

  return (
    <section className="section-panel experiments-arena" id="experiments" aria-labelledby="experiments-arena-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">prototype widget</p>
          <h2 id="experiments-arena-title">Experiment Arena</h2>
          <p className="section-note">Prototype mode: future versions can support chatter battles, giveaways, and stream experiments.</p>
        </div>
        <button className="experiment-button" type="button" onClick={startExperiment}>
          Start experiment
        </button>
      </div>

      <div className="arena-panel glass-panel">
        {arenaChatters.map((chatter, index) => (
          <ScannerTooltip
            key={chatter.id}
            type="chatter"
            id={chatter.id}
            label={winnerId === chatter.id ? 'selected winner' : chatter.status}
            className={`arena-token ${winnerId === chatter.id ? 'is-winner' : ''}`}
            style={{ '--arena-index': index }}
          >
            <span>{chatter.nickname.slice(0, 2).toUpperCase()}</span>
            <small>{chatter.nickname}</small>
          </ScannerTooltip>
        ))}
      </div>
    </section>
  )
}

export default ExperimentsArena
