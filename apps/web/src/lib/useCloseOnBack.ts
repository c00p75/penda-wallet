import { useCallback, useEffect, useRef } from 'react'

/**
 * Makes the Android/browser back button (and back gesture) close an
 * overlay instead of falling through to real navigation.
 *
 * While `active` is true, pushes a history entry so the next back action
 * fires `popstate` instead of leaving the page; that triggers `onClose`.
 * If the overlay closes some other way (Escape, tapping outside, a close
 * button), the pushed entry is popped in cleanup so it doesn't leave a
 * dead stop in the history stack for a later back press to land on.
 *
 * When leaving the overlay via in-app navigation, call `prepareNavigateAway`
 * first and prefer `navigate(to, { replace: true })` so cleanup does not
 * `history.back()` and undo the route change.
 */
export function useCloseOnBack(active: boolean, onClose: () => void) {
  const pushedRef = useRef(false)
  const skipPopRef = useRef(false)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!active) return

    window.history.pushState({ overlay: true }, '')
    pushedRef.current = true

    const handlePopState = () => {
      pushedRef.current = false
      onCloseRef.current()
    }

    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
      if (pushedRef.current) {
        pushedRef.current = false
        if (skipPopRef.current) {
          skipPopRef.current = false
          return
        }
        window.history.back()
      }
    }
  }, [active])

  const prepareNavigateAway = useCallback(() => {
    skipPopRef.current = true
  }, [])

  return { prepareNavigateAway }
}
