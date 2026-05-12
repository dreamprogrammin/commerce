export function useHaptic() {
  const triggerHaptic = (type: 'light' | 'medium' | 'heavy' | 'success' | 'error') => {
    if (typeof navigator === 'undefined' || !navigator.vibrate) return

    const patterns = {
      light: 10,
      medium: 30,
      heavy: 50,
      success: [30, 50, 30],
      error: [50, 100, 50, 100, 50]
    }

    navigator.vibrate(patterns[type])
  }

  return { triggerHaptic }
}
