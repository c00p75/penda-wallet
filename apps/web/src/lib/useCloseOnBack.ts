import { useEffect, useRef } from 'react'

/**
 * Makes the Android/browser back button (and back gesture) close an
 * overlay instead of falling through to real navigation.
 *
 * While `active` is true, pushes a history entry so the next back action
 * fires `popstate` instead of leaving the page; that triggers `onClose`.
 * If the overlay closes some other way (Escape, tapping outside, a close
 * button), the pushed entry is popped in cleanup so it doesn't leave a
 * dead stop in the history stack for a later back press to land on.
 */
export function useCloseOnBack(active: boolean, onClose: () => void) {
  const pushedRef = useRef(false)

  useEffect(() => {
    if (!active) return

    window.history.pushState({ overlay: true }, '')
    pushedRef.current = true

    const handlePopState = () => {
      pushedRef.current = false
      onClose()
    }

    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
      if (pushedRef.current) {
        pushedRef.current = false
        window.history.back()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])
}
