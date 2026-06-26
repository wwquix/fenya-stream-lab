import { useEffect, useMemo, useRef, useState } from 'react'
import { cs2ConsoleCommands } from '../data/cs2ConsoleCommands.js'

const roundDuration = 18

function normalizeCommand(value) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function pickCommand(previousCommand) {
  const pool = cs2ConsoleCommands.filter((item) => item.command !== previousCommand)
  return pool[Math.floor(Math.random() * pool.length)]
}

function getHint(command) {
  const visibleLength = Math.max(2, Math.min(6, Math.ceil(command.length * 0.34)))
  return `${command.slice(0, visibleLength)}...`
}

function getLocalized(value, language) {
  return typeof value === 'object' ? value[language] ?? value.en : value
}

function ConsoleRush({ language = 'ru', t }) {
  const inputRef = useRef(null)
  const [isRunning, setIsRunning] = useState(false)
  const [currentCommand, setCurrentCommand] = useState(() => cs2ConsoleCommands[0])
  const [inputValue, setInputValue] = useState('')
  const [score, setScore] = useState(0)
  const [streak, setStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)
  const [timeLeft, setTimeLeft] = useState(roundDuration)
  const [roundStartedAt, setRoundStartedAt] = useState(null)
  const [reactionMs, setReactionMs] = useState(null)
  const [hint, setHint] = useState('')
  const [feedbackLog, setFeedbackLog] = useState([t.consoleReadyIdle])
  const progress = useMemo(() => `${(timeLeft / roundDuration) * 100}%`, [timeLeft])

  useEffect(() => {
    if (!isRunning) {
      return undefined
    }

    inputRef.current?.focus()
    setRoundStartedAt(Date.now())
    setTimeLeft(roundDuration)

    const intervalId = window.setInterval(() => {
      setTimeLeft((current) => {
        if (current <= 1) {
          setFeedbackLog((log) => [`${t.consoleTimeout}: ${currentCommand.command}`, ...log].slice(0, 4))
          setStreak(0)
          setInputValue('')
          setHint('')
          setCurrentCommand((command) => pickCommand(command.command))
          setRoundStartedAt(Date.now())
          return roundDuration
        }

        return current - 1
      })
    }, 1000)

    return () => window.clearInterval(intervalId)
  }, [currentCommand.command, isRunning])

  function startGame() {
    const nextCommand = pickCommand(currentCommand.command)
    setCurrentCommand(nextCommand)
    setInputValue('')
    setHint('')
    setFeedbackLog([t.consoleReady])
    setIsRunning(true)
  }

  function nextRound(message) {
    setFeedbackLog((log) => [message, ...log].slice(0, 4))
    setCurrentCommand((command) => pickCommand(command.command))
    setInputValue('')
    setHint('')
    setTimeLeft(roundDuration)
    setRoundStartedAt(Date.now())
  }

  function handleSubmit(event) {
    event.preventDefault()

    if (!isRunning) {
      startGame()
      return
    }

    const normalizedInput = normalizeCommand(inputValue)
    const normalizedAnswer = normalizeCommand(currentCommand.command)

    if (normalizedInput === 'okdb') {
      setFeedbackLog((log) => ['OKDB flicker detected', ...log].slice(0, 4))
      setInputValue('')
      return
    }

    if (normalizedInput === 'fenya') {
      setFeedbackLog((log) => ['fenya.exe loaded', ...log].slice(0, 4))
      setInputValue('')
      return
    }

    if (normalizedInput === normalizedAnswer) {
      const nextStreak = streak + 1
      const elapsedMs = roundStartedAt ? Date.now() - roundStartedAt : null
      const difficultyBonus = currentCommand.difficulty === 'hard' ? 35 : currentCommand.difficulty === 'medium' ? 24 : 16
      const speedBonus = Math.max(0, timeLeft * 2)

      setScore((current) => current + difficultyBonus + speedBonus)
      setStreak(nextStreak)
      setBestStreak((current) => Math.max(current, nextStreak))
      setReactionMs(elapsedMs)
      nextRound(nextStreak === 5 ? t.consoleAchievement : `${t.consoleAccepted}: ${currentCommand.command}`)
      return
    }

    setScore((current) => Math.max(0, current - 8))
    setStreak(0)
    setFeedbackLog((log) => [`${t.consoleDenied}: ${currentCommand.command}`, ...log].slice(0, 4))
  }

  function handleHint() {
    setHint(getHint(currentCommand.command))
    setFeedbackLog((log) => [`${t.consoleHintLog}: ${getHint(currentCommand.command)}`, ...log].slice(0, 4))
  }

  function handleSkip() {
    setStreak(0)
    nextRound(`${t.consoleSkipped}: ${currentCommand.command}`)
  }

  function handleReset() {
    setIsRunning(false)
    setScore(0)
    setStreak(0)
    setBestStreak(0)
    setReactionMs(null)
    setTimeLeft(roundDuration)
    setInputValue('')
    setHint('')
    setCurrentCommand(cs2ConsoleCommands[0])
    setFeedbackLog([t.consoleReadyIdle])
  }

  return (
    <div className="console-rush" style={{ '--round-progress': progress }}>
      <div className="console-rush-header">
        <div>
          <span>{t.consoleTrainer}</span>
          <h3>Console Rush</h3>
        </div>
        <button className="console-start-button" type="button" onClick={startGame} disabled={isRunning}>
          {isRunning ? t.consoleRunning : t.consoleStart}
        </button>
      </div>

      <div className={`console-task${isRunning ? ' is-running' : ''}`}>
        <div>
          <span>{t.consoleTask}</span>
          <strong>{getLocalized(currentCommand.task, language)}</strong>
          {currentCommand.note ? <small>{getLocalized(currentCommand.note, language)}</small> : null}
        </div>
        <div className="console-badges">
          {isRunning ? <span>{t.consoleCategories[currentCommand.category]}</span> : null}
          <span className={`difficulty-${currentCommand.difficulty}`}>{t.consoleDifficulties[currentCommand.difficulty]}</span>
        </div>
      </div>

      {isRunning ? (
        <>
          <form className="console-input-row" onSubmit={handleSubmit}>
            <label htmlFor="console-rush-input">&gt;</label>
            <input
              id="console-rush-input"
              ref={inputRef}
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              placeholder="_"
              autoComplete="off"
              spellCheck="false"
            />
          </form>

          <div className="console-progress" aria-label="Round timer">
            <span />
          </div>

          <div className="console-stats">
            <div><span>{t.consoleScore}</span><strong>{score}</strong></div>
            <div><span>{t.consoleStreak}</span><strong>{streak}</strong></div>
            <div><span>{t.consoleBest}</span><strong>{bestStreak}</strong></div>
            <div><span>{t.consoleReaction}</span><strong>{reactionMs ? `${(reactionMs / 1000).toFixed(1)}s` : '--'}</strong></div>
          </div>

          <div className="console-actions">
            <button type="button" onClick={handleHint}>{t.consoleHint}</button>
            <button type="button" onClick={handleSkip}>{t.consoleSkip}</button>
            <button type="button" onClick={handleReset}>{t.consoleReset}</button>
            {hint ? <span>{hint}</span> : null}
          </div>

          <div className="console-log" aria-live="polite">
            {feedbackLog.map((line, index) => (
              <span key={`${line}-${index}`}>{line}</span>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}

export default ConsoleRush
