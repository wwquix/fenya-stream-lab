import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from "motion/react"

function CustomSelect({ id, label, value, options, onChange }) {
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef(null)
  const prefersReducedMotion = useReducedMotion()
  const selectedOption = options.find((option) => option.value === value) ?? options[0]

  useEffect(() => {
    function handlePointerDown(event) {
      if (!rootRef.current?.contains(event.target)) {
        setIsOpen(false)
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  function selectOption(nextValue) {
    onChange(nextValue)
    setIsOpen(false)
  }

  return (
    <div className={`custom-select ${isOpen ? 'is-open' : ''}`} ref={rootRef}>
      <span className="custom-select-label" id={`${id}-label`}>
        {label}
      </span>
      <button
        className="custom-select-trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-labelledby={`${id}-label ${id}-value`}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span id={`${id}-value`}>{selectedOption?.label}</span>
      </button>
      <AnimatePresence>
        {isOpen ? (
          <motion.div
            className="custom-select-menu"
            role="listbox"
            aria-labelledby={`${id}-label`}
            initial={prefersReducedMotion ? { opacity: 1, y: 0, scaleY: 1 } : { opacity: 0, y: -6, scaleY: 0.96 }}
            animate={{ opacity: 1, y: 0, scaleY: 1 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -4, scaleY: 0.98 }}
            transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            style={{ transformOrigin: 'top' }}
          >
            {options.map((option) => (
              <button
                className={option.value === value ? 'is-selected' : ''}
                type="button"
                role="option"
                aria-selected={option.value === value}
                onClick={() => selectOption(option.value)}
                key={option.value}
              >
                {option.label}
              </button>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

export default CustomSelect
