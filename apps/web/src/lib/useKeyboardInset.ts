import { useEffect, useState } from 'react'

/**
 * Tracks how many pixels the on-screen keyboard (or other interactive widget)
 * currently covers at the bottom of the layout viewport.
 *
 * Mobile browsers overlay the keyboard on top of `position: fixed` elements
 * anchored to the bottom, so a bottom sheet's input ends up hidden behind it.
 * We read `window.visualViewport` — which shrinks when the keyboard opens — and
 * return the covered height so callers can lift content clear of it.
 *
 * Returns 0 when there is no keyboard, or when `visualViewport` is unavailable.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0)

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    const update = () => {
      const covered = window.innerHeight - vv.height - vv.offsetTop
      // Ignore sub-pixel jitter and the small deltas from URL-bar show/hide.
      setInset(covered > 40 ? Math.round(covered) : 0)
    }

    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  return inset
}
