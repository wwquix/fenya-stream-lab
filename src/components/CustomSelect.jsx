import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from "motion/react"
import { getNextOptionIndex } from '../utils/customSelect.js'

function CustomSelect({ id, label, value, options, onChange, disabled = false }) {
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const optionRefs = useRef([])
  const prefersReducedMotion = useReducedMotion()
  const selectedOption = options.find((option) => option.value === value) ?? options[0]
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === selectedOption?.value))

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

  useEffect(() => {
    if (isOpen) optionRefs.current[activeIndex]?.focus()
  }, [activeIndex, isOpen])

  function openMenu(index = selectedIndex) {
    if (!options.length) return
    setActiveIndex(index)
    setIsOpen(true)
  }

  function closeMenu({ returnFocus = false } = {}) {
    setIsOpen(false)
    if (returnFocus) triggerRef.current?.focus()
  }

  function selectOption(nextValue) {
    onChange(nextValue)
    closeMenu({ returnFocus: true })
  }

  function handleTriggerKeyDown(event) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    openMenu(getNextOptionIndex(selectedIndex, event.key, options.length))
  }

  function handleOptionKeyDown(event, index, optionValue) {
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault()
      setActiveIndex(getNextOptionIndex(index, event.key, options.length))
      return
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      selectOption(optionValue)
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      closeMenu({ returnFocus: true })
      return
    }

    if (event.key === 'Tab') closeMenu()
  }

  return (
    <div className={`custom-select ${isOpen ? 'is-open' : ''} ${disabled ? 'is-disabled' : ''}`} ref={rootRef}>
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
          disabled={disabled}
          ref={triggerRef}
          onClick={() => (isOpen ? closeMenu() : openMenu())}
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
                className={option.value === value ? 'is-selected' : ''}
                id={`${id}-option-${index}`}
                type="button"
                role="option"
                aria-selected={option.value === value}
                tabIndex={isOpen && activeIndex === index ? 0 : -1}
                disabled={disabled}
                ref={(element) => { optionRefs.current[index] = element }}
                onFocus={() => setActiveIndex(index)}
                onClick={() => selectOption(option.value)}
                onKeyDown={(event) => handleOptionKeyDown(event, index, option.value)}
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
