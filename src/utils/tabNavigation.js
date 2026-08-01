export function getNextTabIndex(currentIndex, key, tabCount) {
  if (!Number.isInteger(tabCount) || tabCount <= 0) return -1

  const safeIndex = Number.isInteger(currentIndex) && currentIndex >= 0 && currentIndex < tabCount
    ? currentIndex
    : 0

  if (key === 'Home') return 0
  if (key === 'End') return tabCount - 1
  if (key === 'ArrowRight') return (safeIndex + 1) % tabCount
  if (key === 'ArrowLeft') return (safeIndex - 1 + tabCount) % tabCount
  return safeIndex
}
