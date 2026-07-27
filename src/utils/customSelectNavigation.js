export function getNextCustomSelectIndex(currentIndex, key, optionCount) {
  if (optionCount <= 0) return -1
  if (key === 'Home') return 0
  if (key === 'End') return optionCount - 1
  if (key === 'ArrowDown') return (currentIndex + 1) % optionCount
  if (key === 'ArrowUp') return (currentIndex - 1 + optionCount) % optionCount
  return currentIndex
}
