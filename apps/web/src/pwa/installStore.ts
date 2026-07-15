// The install singleton. `beforeinstallprompt` fires ONCE, early, right after
// the page loads — long before the user reaches any settings screen. If the only
// listener lives inside a component that mounts later, the event is gone and the
// app can never offer to install. So we capture it at module load (see
// initInstallCapture, called from main.tsx) and stash the deferred event here,
// where any component can reach it via useInstallPrompt.

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'penda:install-dismissed'

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const displayStandalone =
    typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches
  // iOS Safari exposes standalone directly on navigator.
  const iosStandalone = 'standalone' in navigator && (navigator as { standalone?: boolean }).standalone === true
  return displayStandalone || iosStandalone
}

export function isIos(): boolean {
  return typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

export interface InstallSnapshot {
  /** A native install dialog is available right now (Android/desktop Chrome). */
  canPrompt: boolean
  /** Already running as an installed app. */
  installed: boolean
  /** iOS has no install event — the UI must show manual Share-sheet steps. */
  showIosInstructions: boolean
  /** The user closed the install banner; don't nag again. */
  dismissed: boolean
}

let deferredPrompt: BeforeInstallPromptEvent | null = null
let installed = isStandalone()
let dismissed = readDismissed()

function computeSnapshot(): InstallSnapshot {
  return {
    canPrompt: !!deferredPrompt,
    installed,
    showIosInstructions: !installed && isIos(),
    dismissed,
  }
}

// Cached so useSyncExternalStore gets a stable reference between changes.
let snapshot: InstallSnapshot = computeSnapshot()
const listeners = new Set<() => void>()

function emit() {
  snapshot = computeSnapshot()
  for (const listener of listeners) listener()
}

let initialized = false

/** Register the global listeners as early as possible. Idempotent. */
export function initInstallCapture() {
  if (initialized || typeof window === 'undefined') return
  initialized = true

  window.addEventListener('beforeinstallprompt', (e) => {
    // Stop Chrome's own mini-infobar so we control when/where to offer it.
    e.preventDefault()
    deferredPrompt = e as BeforeInstallPromptEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    installed = true
    deferredPrompt = null
    emit()
  })
  if (typeof window.matchMedia === 'function') {
    window.matchMedia('(display-mode: standalone)').addEventListener?.('change', () => {
      installed = isStandalone()
      emit()
    })
  }
}

export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getInstallSnapshot(): InstallSnapshot {
  return snapshot
}

/** Show the native install dialog. No-op where none is available. */
export async function promptInstall() {
  if (!deferredPrompt) return
  await deferredPrompt.prompt()
  const choice = await deferredPrompt.userChoice
  if (choice.outcome === 'accepted') {
    // A one-shot event: it can't be reused after prompting.
    deferredPrompt = null
    emit()
  }
}

/** Permanently hide the install banner for this browser. */
export function dismissInstall() {
  dismissed = true
  try {
    localStorage.setItem(DISMISS_KEY, '1')
  } catch {
    // Private mode / storage disabled — a session-only dismiss is fine.
  }
  emit()
}
