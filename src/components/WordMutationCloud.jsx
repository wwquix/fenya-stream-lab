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

function isNumericToken(value) {
  return /^\d[\d\s.,]*$/.test(String(value).trim())
}

function isObviousSpamToken(value) {
  const text = String(value).trim()
  if (!text) return true
  return /^(?:https?|www|t\.me|discord\.gg|com|ru|by|net|org)$/i.test(text)
    || /(?:https?:\/\/|www\.|t\.me\/|discord\.gg\/|[a-z0-9_-]+\.(?:com|ru|by|net|org)(?:\/|$))/i.test(text)
    || (text.length > 48 && !text.includes(' '))
}

function getCountBasedSize(weight, index, text) {
  if (isNumericToken(text)) return 'sm'
  if (index < 4) return 'hero'
  if (weight >= 70) return 'lg'
  if (weight >= 42) return 'md'
  return 'sm'
}

function mergeBackendWords(fallbackWords, wordAnalytics) {
  if (!Array.isArray(wordAnalytics?.words) || wordAnalytics.words.length === 0) {
    const filteredFallbackWords = fallbackWords.filter((word) => !isObviousSpamToken(getWordText(word, 'ru')))
    return normalizeWeightsFromCounts([...filteredFallbackWords].sort((first, second) => second.count - first.count))
      .map((word, index) => ({
        ...word,
        size: getCountBasedSize(word.weight, index, getWordText(word, 'ru')),
        slot: 'auto',
      }))
  }

  const mostFrequentWords = [...wordAnalytics.words]
    .filter((word) => !isObviousSpamToken(word.text))
    .sort((first, second) => second.count - first.count)
    .slice(0, 28)

  return normalizeWeightsFromCounts(mostFrequentWords)
    .map((word, index) => {
      const fallbackWord = fallbackWords[index % fallbackWords.length] ?? {}

      return {
        ...fallbackWord,
        id: `backend-word-${index + 1}-${word.text.toLocaleLowerCase('ru-RU').replace(/[^a-zа-яё0-9]+/gi, '-')}`,
        text: word.text,
        count: word.count,
        weight: word.weight,
        size: getCountBasedSize(word.weight, index, word.text),
        slot: 'auto',
        tone: backendToneMap[word.tone] ?? fallbackWord.tone ?? 'muted',
        category: word.category,
      }
    })
}

function WordMutationCloud({ words, wordAnalytics, streamId, language = 'ru', realDataMode = false, t }) {
  const visibleWords = mergeBackendWords(words, wordAnalytics)
  const prefersReducedMotion = useReducedMotion()
  const isMinimalCloud = realDataMode && visibleWords.length <= 3

  return (
    <Reveal as="section" className="section-panel word-mutations liquid-glass liquid-surface" id="words" aria-labelledby="word-mutations-title" data-entity-type="stream" data-entity-id={streamId} data-liquid-interactive>
      <div className="section-heading">
        <div>
          <h2 id="word-mutations-title">{realDataMode ? t.chatWordsTitle : t.speechPatterns}</h2>
        </div>
      </div>

      <div className={`word-cloud word-cloud-dense glass-panel liquid-card soft-glow ${isMinimalCloud ? 'is-minimal' : ''}`}>
        {visibleWords.map((word, index) => {
          const countLabel = `${formatCount(word.count, language)} ${t.mentions}`
          const text = getWordText(word, language)

          return (
            <ScannerTooltip
              as={motion.button}
              htmlType="button"
              key={word.id}
              type="word"
              id={word.id}
              className={`word-token stagger-item word-size-${word.size} word-tone-${word.tone ?? 'muted'} ${isNumericToken(text) ? 'word-kind-number' : 'word-kind-text'}`}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={prefersReducedMotion
                ? { duration: 0 }
                : { duration: 0.46, delay: Math.min(index, 47) * 0.012, ease: [0.16, 1, 0.3, 1] }}
              title={countLabel}
            >
              <span>{text}</span>
              <small className="sr-only">{countLabel}</small>
            </ScannerTooltip>
          )
        })}
      </div>
    </Reveal>
  )
}

export default WordMutationCloud
