import ScannerTooltip from './ScannerTooltip.jsx'
import { Reveal } from './MotionPrimitives.jsx'
import { motion, useReducedMotion } from 'motion/react'

function formatCount(count, language) {
  return count.toLocaleString(language === 'ru' ? 'ru-RU' : 'en-US')
}

function getWordText(word, language) {
  if (typeof word.text === 'string') {
    return word.text
  }

  return word.text?.[language] ?? word.text?.en ?? word.label
}

const backendToneMap = {
  neutral: 'muted',
  hype: 'cyan',
  toxic: 'violet',
  funny: 'light',
}

const minimumWeight = 8
const maximumWeight = 100

function normalizeWeightsFromCounts(words) {
  const counts = words.map((word) => word.count)
  const minimumCount = Math.min(...counts)
  const maximumCount = Math.max(...counts)
  const countRange = maximumCount - minimumCount
  const uniqueCounts = [...new Set(counts)].sort((first, second) => first - second)
  const weightByCount = new Map()
  let previousWeight = minimumWeight - 1

  uniqueCounts.forEach((count, index) => {
    const normalizedCount = countRange === 0 ? 1 : (count - minimumCount) / countRange
    const smoothWeight = Math.round(minimumWeight + Math.sqrt(normalizedCount) * (maximumWeight - minimumWeight))
    const maximumAllowedWeight = maximumWeight - (uniqueCounts.length - index - 1)
    const weight = Math.min(maximumAllowedWeight, Math.max(previousWeight + 1, smoothWeight))
    weightByCount.set(count, weight)
    previousWeight = weight
  })

  return words.map((word) => ({ ...word, weight: weightByCount.get(word.count) }))
}

function getCountBasedSize(weight, index) {
  if (index === 0) return 'hero'
  if (index === 1) return 'xl'
  if (weight >= 70) return 'lg'
  if (weight >= 42) return 'md'
  if (weight >= 25) return 'sm'
  return 'xs'
}

function getStableVerticalDrift(word, index) {
  const seed = `${word.id ?? word.text}-${index}`
  let hash = 0

  for (let characterIndex = 0; characterIndex < seed.length; characterIndex += 1) {
    hash = (hash * 31 + seed.charCodeAt(characterIndex)) >>> 0
  }

  return (hash % 7) - 3
}

function mergeBackendWords(fallbackWords, wordAnalytics) {
  if (!Array.isArray(wordAnalytics?.words) || wordAnalytics.words.length === 0) {
    return normalizeWeightsFromCounts([...fallbackWords].sort((first, second) => second.count - first.count))
      .map((word, index) => ({
        ...word,
        size: getCountBasedSize(word.weight, index),
        slot: 'auto',
      }))
  }

  const mostFrequentWords = [...wordAnalytics.words]
    .sort((first, second) => second.count - first.count)
    .slice(0, 50)

  return normalizeWeightsFromCounts(mostFrequentWords)
    .map((word, index) => {
      const fallbackWord = fallbackWords[index % fallbackWords.length] ?? {}

      return {
        ...fallbackWord,
        id: `backend-word-${index + 1}-${word.text.toLocaleLowerCase('ru-RU').replace(/[^a-zа-яё0-9]+/gi, '-')}`,
        text: word.text,
        count: word.count,
        weight: word.weight,
        size: getCountBasedSize(word.weight, index),
        slot: 'auto',
        tone: backendToneMap[word.tone] ?? fallbackWord.tone ?? 'muted',
        category: word.category,
      }
    })
}

function WordMutationCloud({ words, wordAnalytics, streamId, language = 'ru', t }) {
  const visibleWords = mergeBackendWords(words, wordAnalytics)
  const prefersReducedMotion = useReducedMotion()

  return (
    <Reveal as="section" className="section-panel word-mutations" id="speech" aria-labelledby="word-mutations-title" data-entity-type="stream" data-entity-id={streamId}>
      <div className="section-heading">
        <div>
          {t.speechKicker ? <p className="eyebrow">{t.speechKicker}</p> : null}
          <h2 id="word-mutations-title">{t.speechPatterns}</h2>
          <p className="section-note">{t.speechNote}</p>
        </div>
      </div>

      <div className="word-cloud word-cloud-dense glass-panel liquid-card soft-glow">
        {visibleWords.map((word, index) => {
          const countLabel = `${formatCount(word.count, language)} ${t.mentions}`
          const verticalDrift = getStableVerticalDrift(word, index)

          return (
            <ScannerTooltip
              as={motion.button}
              htmlType="button"
              key={word.id}
              type="word"
              id={word.id}
              className={`word-token stagger-item word-size-${word.size} word-tone-${word.tone ?? 'muted'}`}
              initial={prefersReducedMotion ? false : { opacity: 0, y: verticalDrift + 10, scale: 0.97 }}
              animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: verticalDrift, scale: 1 }}
              whileHover={prefersReducedMotion ? undefined : { y: verticalDrift - 2, scale: 1.035 }}
              transition={prefersReducedMotion
                ? { duration: 0 }
                : { duration: 0.46, delay: Math.min(index, 47) * 0.012, ease: [0.16, 1, 0.3, 1] }}
              style={{ '--word-drift-y': `${verticalDrift}px` }}
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
