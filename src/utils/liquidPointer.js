const liquidInteractiveSelector = '[data-liquid-interactive]'

function clampLiquidPercent(value) {
  if (!Number.isFinite(value)) return 50
  return Math.min(100, Math.max(0, value))
}

function calculateLiquidPointerPosition(rect, clientX, clientY) {
  if (!rect || rect.width <= 0 || rect.height <= 0) {
    return { x: 50, y: 0 }
  }

  return {
    x: clampLiquidPercent(((clientX - rect.left) / rect.width) * 100),
    y: clampLiquidPercent(((clientY - rect.top) / rect.height) * 100),
  }
}

function createLiquidPointerController({
  root,
  finePointer,
  reducedMotion,
  requestFrame,
  cancelFrame,
}) {
  if (!root) return () => {}

  let activeElement = null
  let pendingPointer = null
  let frameId = null

  function canTrackPointer() {
    return Boolean(finePointer?.matches && !reducedMotion?.matches)
  }

  function findInteractiveElement(target) {
    const element = target?.closest?.(liquidInteractiveSelector)
    return element && root.contains(element) ? element : null
  }

  function hideActiveElement() {
    activeElement?.style?.setProperty('--liquid-pointer-opacity', '0')
    activeElement = null
    pendingPointer = null
  }

  function flushPointerFrame() {
    frameId = null
    if (!pendingPointer || !canTrackPointer()) {
      hideActiveElement()
      return
    }

    const { element, clientX, clientY } = pendingPointer
    pendingPointer = null
    const position = calculateLiquidPointerPosition(element.getBoundingClientRect(), clientX, clientY)
    element.style.setProperty('--liquid-pointer-x', `${position.x}%`)
    element.style.setProperty('--liquid-pointer-y', `${position.y}%`)
    element.style.setProperty('--liquid-pointer-opacity', '1')
  }

  function handlePointerMove(event) {
    if (!canTrackPointer()) {
      hideActiveElement()
      return
    }

    const element = findInteractiveElement(event.target)
    if (!element) {
      hideActiveElement()
      return
    }

    if (activeElement && activeElement !== element) {
      activeElement.style.setProperty('--liquid-pointer-opacity', '0')
    }

    activeElement = element
    pendingPointer = {
      element,
      clientX: event.clientX,
      clientY: event.clientY,
    }

    if (frameId === null) {
      frameId = requestFrame(flushPointerFrame)
    }
  }

  function handlePointerOut(event) {
    if (!activeElement || activeElement.contains?.(event.relatedTarget)) return
    hideActiveElement()
  }

  function handlePreferenceChange() {
    if (!canTrackPointer()) hideActiveElement()
  }

  root.addEventListener('pointermove', handlePointerMove, { passive: true })
  root.addEventListener('pointerout', handlePointerOut, { passive: true })
  finePointer?.addEventListener?.('change', handlePreferenceChange)
  reducedMotion?.addEventListener?.('change', handlePreferenceChange)

  return () => {
    if (frameId !== null) cancelFrame(frameId)
    hideActiveElement()
    root.removeEventListener('pointermove', handlePointerMove)
    root.removeEventListener('pointerout', handlePointerOut)
    finePointer?.removeEventListener?.('change', handlePreferenceChange)
    reducedMotion?.removeEventListener?.('change', handlePreferenceChange)
  }
}

export {
  calculateLiquidPointerPosition,
  clampLiquidPercent,
  createLiquidPointerController,
}
