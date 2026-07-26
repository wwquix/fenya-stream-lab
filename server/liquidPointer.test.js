import { describe, expect, test, vi } from 'vitest'
import {
  calculateLiquidPointerPosition,
  clampLiquidPercent,
  createLiquidPointerController,
} from '../src/utils/liquidPointer.js'

function createMediaQuery(matches) {
  return {
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
}

describe('liquid pointer geometry', () => {
  test('converts pointer coordinates to surface percentages', () => {
    expect(calculateLiquidPointerPosition(
      { left: 100, top: 50, width: 400, height: 200 },
      300,
      100,
    )).toEqual({ x: 50, y: 25 })
  })

  test('clamps percentages to the 0-100 range', () => {
    expect(clampLiquidPercent(-12)).toBe(0)
    expect(clampLiquidPercent(140)).toBe(100)
    expect(calculateLiquidPointerPosition(
      { left: 10, top: 10, width: 100, height: 100 },
      -20,
      180,
    )).toEqual({ x: 0, y: 100 })
  })
})

describe('liquid pointer controller', () => {
  test('batches pointer updates and fully detaches during cleanup', () => {
    const listeners = new Map()
    const style = { setProperty: vi.fn() }
    const surface = {
      contains: vi.fn(() => false),
      getBoundingClientRect: vi.fn(() => ({ left: 0, top: 0, width: 200, height: 100 })),
      style,
    }
    const root = {
      addEventListener: vi.fn((type, listener) => listeners.set(type, listener)),
      removeEventListener: vi.fn((type) => listeners.delete(type)),
      contains: vi.fn(() => true),
    }
    const target = { closest: vi.fn(() => surface) }
    const finePointer = createMediaQuery(true)
    const reducedMotion = createMediaQuery(false)
    let scheduledFrame = null
    const requestFrame = vi.fn((callback) => {
      scheduledFrame = callback
      return 17
    })
    const cancelFrame = vi.fn()

    const cleanup = createLiquidPointerController({
      root,
      finePointer,
      reducedMotion,
      requestFrame,
      cancelFrame,
    })

    listeners.get('pointermove')({ target, clientX: 50, clientY: 75 })
    listeners.get('pointermove')({ target, clientX: 100, clientY: 25 })
    expect(requestFrame).toHaveBeenCalledTimes(1)
    scheduledFrame()
    expect(surface.getBoundingClientRect).toHaveBeenCalledTimes(1)
    expect(style.setProperty).toHaveBeenCalledWith('--liquid-pointer-x', '50%')
    expect(style.setProperty).toHaveBeenCalledWith('--liquid-pointer-y', '25%')
    expect(style.setProperty).toHaveBeenCalledWith('--liquid-pointer-opacity', '1')

    listeners.get('pointermove')({ target, clientX: 150, clientY: 50 })
    cleanup()
    expect(cancelFrame).toHaveBeenCalledWith(17)
    expect(style.setProperty).toHaveBeenLastCalledWith('--liquid-pointer-opacity', '0')
    expect(root.removeEventListener).toHaveBeenCalledTimes(2)
    expect(finePointer.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function))
    expect(reducedMotion.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function))
    expect(listeners.size).toBe(0)
  })
})
