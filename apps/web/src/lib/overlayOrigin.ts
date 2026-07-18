import { create } from 'zustand'

type OverlayOrigin = {
  x: number
  y: number
  /** Epoch ms, overlays only use origins that are still fresh. */
  at: number
}

interface OverlayOriginState extends OverlayOrigin {
  /** Capture the center of a trigger element (button, tile, etc.). */
  captureFromElement: (el: Element | null | undefined) => void
  /** Convenience for React mouse/pointer events. */
  captureFromEvent: (e: { currentTarget: EventTarget }) => void
  /** Read origin if set within the last 2s; otherwise null. */
  peek: () => OverlayOrigin | null
}

const FRESH_MS = 2000

export const useOverlayOriginStore = create<OverlayOriginState>((set, get) => ({
  x: typeof window !== 'undefined' ? window.innerWidth / 2 : 0,
  y: typeof window !== 'undefined' ? window.innerHeight / 2 : 0,
  at: 0,
  captureFromElement: (el) => {
    if (!(el instanceof Element)) return
    const r = el.getBoundingClientRect()
    set({
      x: r.left + r.width / 2,
      y: r.top + r.height / 2,
      at: Date.now(),
    })
  },
  captureFromEvent: (e) => {
    get().captureFromElement(e.currentTarget instanceof Element ? e.currentTarget : null)
  },
  peek: () => {
    const { x, y, at } = get()
    if (!at || Date.now() - at > FRESH_MS) return null
    return { x, y, at }
  },
}))

/** Capture overlay origin from a trigger element or event target. */
export function captureOverlayOrigin(target: Element | EventTarget | null | undefined) {
  useOverlayOriginStore.getState().captureFromElement(target instanceof Element ? target : null)
}
