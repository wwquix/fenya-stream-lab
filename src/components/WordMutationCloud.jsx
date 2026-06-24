import ScannerTooltip from './ScannerTooltip.jsx'
import { Reveal } from './MotionPrimitives.jsx'

function formatCount(count, language) {
  return count.toLocaleString(language === 'ru' ? 'ru-RU' : 'en-US')
}

function getWordText(word, language) {
  return word.text?.[language] ?? word.text?.en ?? word.label
}

function WordMutationCloud({ words, streamId, language = 'ru', t }) {
  return (
    <Reveal as="section" className="section-panel word-mutations" id="speech" aria-labelledby="word-mutations-title" data-entity-type="stream" data-entity-id={streamId}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">{t.speechKicker}</p>
          <h2 id="word-mutations-title">{t.speechPatterns}</h2>
          <p className="section-note">{t.speechNote}</p>
        </div>
      </div>

      <div className="word-cloud glass-panel">
        {words.map((word) => {
          const countLabel = `${formatCount(word.count, language)} ${t.mentions}`

          return (
            <ScannerTooltip
              as="button"
              key={word.id}
              type="word"
              id={word.id}
              className={`word-token word-size-${word.size} word-tone-${word.tone ?? 'muted'} word-slot-${word.slot ?? 'auto'}`}
            >
              <span>{getWordText(word, language)}</span>
              <small>{countLabel}</small>
            </ScannerTooltip>
          )
        })}
      </div>
    </Reveal>
  )
}

export default WordMutationCloud
