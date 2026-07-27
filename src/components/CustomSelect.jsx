import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from "motion/react"
import { getNextCustomSelectIndex } from '../utils/customSelectNavigation.js'

function CustomSelect({ id, label, value, options, onChange, disabled = false }) {
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const optionRefs = useRef([])
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
    window.requestAnimationFrame(() => triggerRef.current?.focus())
  }

  function focusOption(index) {
    window.requestAnimationFrame(() => optionRefs.current[index]?.focus())
  }

  function handleTriggerKeyDown(event) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value))
    setIsOpen(true)
    focusOption(event.key === 'ArrowUp' || event.key === 'End' ? options.length - 1 : selectedIndex)
  }

  function handleOptionKeyDown(event, index) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      selectOption(options[index].value)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      setIsOpen(false)
      triggerRef.current?.focus()
      return
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    optionRefs.current[getNextCustomSelectIndex(index, event.key, options.length)]?.focus()
  }

  return (
    <div className={`custom-select ${isOpen ? 'is-open' : ''} ${disabled ? 'is-disabled' : ''}`} ref={rootRef}>
      <span className="custom-select-label" id={`${id}-label`}>
        {label}
      </span>
      <div className="custom-select-shell liquid-control">
        <button
          ref={triggerRef}
          className="custom-select-trigger"
          type="button"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={`${id}-menu`}
          aria-labelledby={`${id}-label ${id}-value`}
          disabled={disabled}
          onClick={() => setIsOpen((open) => !open)}
          onKeyDown={handleTriggerKeyDown}
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
            {options.map((option, index) => (
              <button
                ref={(element) => { optionRefs.current[index] = element }}
                className={option.value === value ? 'is-selected' : ''}
                type="button"
                role="option"
                aria-selected={option.value === value}
                tabIndex={isOpen ? 0 : -1}
                disabled={disabled}
                onClick={() => selectOption(option.value)}
                onKeyDown={(event) => handleOptionKeyDown(event, index)}
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
