import { useEffect, useRef, useState } from 'react'
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react"

const calmEase = [0.16, 1, 0.3, 1]
const cardRevealVariants = {
  hidden: { opacity: 0, y: 14, scale: 0.988 },
  visible: (delay = 0) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.52, delay, ease: calmEase },
  }),
}

function getMotionComponent(as) {
  return typeof as === 'string' && motion[as] ? motion[as] : motion.div
}

function Reveal({ as = 'div', children, transition, ...props }) {
  const prefersReducedMotion = useReducedMotion()
  const Component = getMotionComponent(as)

  return (
    <Component
      initial={prefersReducedMotion ? { opacity: 1, y: 0, filter: 'none' } : { opacity: 0, y: 26, filter: 'blur(8px)' }}
      whileInView={prefersReducedMotion
        ? { opacity: 1, y: 0, filter: 'none' }
        : { opacity: 1, y: 0, filter: 'blur(0px)', transitionEnd: { filter: 'none' } }}
      viewport={{ once: true, amount: 0.16 }}
      transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.68, ease: calmEase, ...transition }}
      {...props}
    >
      {children}
    </Component>
  )
}

function MotionCard({ as = 'div', children, transition, revealDelay = 0, ...props }) {
  const prefersReducedMotion = useReducedMotion()
  const Component = getMotionComponent(as)

  return (
    <Component
      custom={revealDelay}
      variants={cardRevealVariants}
      initial={prefersReducedMotion ? 'visible' : 'hidden'}
      whileInView="visible"
      viewport={{ once: true, amount: 0.14 }}
      whileHover={prefersReducedMotion ? undefined : { y: -3, scale: 1.006 }}
      whileTap={prefersReducedMotion ? undefined : { scale: 0.99 }}
      transition={{ duration: 0.22, ease: calmEase, ...transition }}
      {...props}
    >
      {children}
    </Component>
  )
}

function AnimatedNumber({ value, format = (nextValue) => Math.round(nextValue).toLocaleString(), duration = 0.65 }) {
  const prefersReducedMotion = useReducedMotion()
  const numericValue = Number(value)
  const motionValue = useMotionValue(Number.isFinite(numericValue) ? numericValue : 0)
  const formattedValue = useTransform(motionValue, (latest) => format(latest))
  const [displayValue, setDisplayValue] = useState(() => (Number.isFinite(numericValue) ? format(numericValue) : String(value)))

  useEffect(() => {
    if (!Number.isFinite(numericValue)) {
      setDisplayValue(String(value))
      return undefined
    }

    if (prefersReducedMotion) {
      motionValue.set(numericValue)
      setDisplayValue(format(numericValue))
      return undefined
    }

    const unsubscribe = formattedValue.on('change', setDisplayValue)
    const controls = animate(motionValue, numericValue, { duration, ease: calmEase })

    return () => {
      controls.stop()
      unsubscribe()
    }
  }, [duration, format, formattedValue, motionValue, numericValue, prefersReducedMotion, value])

  return <>{displayValue}</>
}

function RippleSurface({ as = 'div', children, className = '', onClick, revealDelay = 0, ...props }) {
  const prefersReducedMotion = useReducedMotion()
  const Component = getMotionComponent(as)
  const [ripples, setRipples] = useState([])
  const rippleTimeoutsRef = useRef([])

  useEffect(() => () => {
    rippleTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId))
  }, [])

  function handleClick(event) {
    if (!prefersReducedMotion) {
      const rect = event.currentTarget.getBoundingClientRect()
      const size = Math.max(rect.width, rect.height) * 1.15
      const id = `${Date.now()}-${Math.random()}`

      setRipples((current) => [
        ...current,
        {
          id,
          size,
          x: event.clientX - rect.left - size / 2,
          y: event.clientY - rect.top - size / 2,
        },
      ])
      const timeoutId = window.setTimeout(() => {
        setRipples((current) => current.filter((ripple) => ripple.id !== id))
      }, 520)
      rippleTimeoutsRef.current.push(timeoutId)
    }

    onClick?.(event)
  }

  return (
    <Component
      className={`${className} ripple-surface`}
      onClick={handleClick}
      custom={revealDelay}
      variants={cardRevealVariants}
      initial={prefersReducedMotion ? 'visible' : 'hidden'}
      whileInView="visible"
      viewport={{ once: true, amount: 0.12 }}
      whileHover={prefersReducedMotion ? undefined : { y: -2 }}
      whileTap={prefersReducedMotion ? undefined : { scale: 0.99 }}
      transition={{ duration: 0.18, ease: calmEase }}
      {...props}
    >
      <span className="ripple-layer" aria-hidden="true">
        {ripples.map((ripple) => (
          <motion.span
            className="ripple-mark"
            key={ripple.id}
            initial={{ opacity: 0.18, scale: 0 }}
            animate={{ opacity: 0, scale: 1 }}
            transition={{ duration: 0.5, ease: calmEase }}
            style={{
              left: ripple.x,
              top: ripple.y,
              width: ripple.size,
              height: ripple.size,
            }}
          />
        ))}
      </span>
      {children}
    </Component>
  )
}

function ProgressActionButton({ children, preparingLabel, duration = 1100, onAction, className = '', ...props }) {
  const prefersReducedMotion = useReducedMotion()
  const [isPreparing, setIsPreparing] = useState(false)
  const timeoutRef = useRef(null)

  useEffect(() => () => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current)
    }
  }, [])

  function handleClick(event) {
    if (isPreparing) {
      return
    }

    setIsPreparing(true)

    timeoutRef.current = window.setTimeout(
      () => {
        onAction?.(event)
        setIsPreparing(false)
      },
      prefersReducedMotion ? 0 : duration,
    )
  }

  return (
    <button className={`${className} progress-action ${isPreparing ? 'is-preparing' : ''}`} type="button" onClick={handleClick} disabled={isPreparing} {...props}>
      <span className="progress-action-label">{isPreparing ? preparingLabel : children}</span>
      <motion.span
        className="progress-action-line"
        aria-hidden="true"
        initial={false}
        animate={isPreparing && !prefersReducedMotion ? { scaleX: 1, opacity: 1 } : { scaleX: 0, opacity: 0 }}
        transition={{ duration: duration / 1000, ease: calmEase }}
      />
    </button>
  )
}

export { AnimatedNumber, MotionCard, ProgressActionButton, Reveal, RippleSurface }
