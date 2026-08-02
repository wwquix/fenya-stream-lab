import { useEffect } from 'react'
import { createLiquidPointerController } from '../utils/liquidPointer.js'

function useLiquidPointer() {
  useEffect(() => {
    const root = document.getElementById('root')
    if (!root) return undefined

    return createLiquidPointerController({
      root,
      finePointer: window.matchMedia('(hover: hover) and (pointer: fine)'),
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)'),
      requestFrame: window.requestAnimationFrame.bind(window),
      cancelFrame: window.cancelAnimationFrame.bind(window),
    })
  }, [])
}

export { useLiquidPointer }
