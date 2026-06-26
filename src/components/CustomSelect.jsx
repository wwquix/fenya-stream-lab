import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from "motion/react"

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
      <div className="custom-select-shell">
        <button
          className="custom-select-trigger"
          type="button"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={`${id}-menu`}
          aria-labelledby={`${id}-label ${id}-value`}
          onClick={() => setIsOpen((open) => !open)}
        >
          <span id={`${id}-value`}>{selectedOption?.label}</span>
        </button>
        <motion.div
          className="custom-select-menu"
          id={`${id}-menu`}
          role="listbox"
          aria-labelledby={`${id}-label`}
          aria-hidden={!isOpen}
          initial={false}
          animate={prefersReducedMotion ? { height: isOpen ? 'auto' : 0, opacity: isOpen ? 1 : 0 } : { height: isOpen ? 'auto' : 0, opacity: isOpen ? 1 : 0, y: isOpen ? 0 : -4 }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="custom-select-options">
            {options.map((option) => (
              <button
                className={option.value === value ? 'is-selected' : ''}
                type="button"
                role="option"
                aria-selected={option.value === value}
                tabIndex={isOpen ? 0 : -1}
                onClick={() => selectOption(option.value)}
                key={option.value}
              >
                {option.label}
              </button>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  )
}

export default CustomSelect
