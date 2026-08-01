export function getNextOptionIndex(currentIndex, key, optionCount) {
  if (!Number.isInteger(optionCount) || optionCount <= 0) return -1

  const safeIndex = Number.isInteger(currentIndex) && currentIndex >= 0 && currentIndex < optionCount
    ? currentIndex
    : 0

  if (key === 'Home') return 0
  if (key === 'End') return optionCount - 1
  if (key === 'ArrowDown') return (safeIndex + 1) % optionCount
  if (key === 'ArrowUp') return (safeIndex - 1 + optionCount) % optionCount
  return safeIndex
}
