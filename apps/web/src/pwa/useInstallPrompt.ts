import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari exposes standalone directly on navigator
    ('standalone' in navigator && (navigator as { standalone?: boolean }).standalone === true)
  )
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

/**
 * Install-prompt state: `prompt()` triggers the native dialog where the
 * platform provides one (Android/desktop Chrome); iOS has no install event,
 * so `showIosInstructions` signals the UI to render manual
 * "Share → Add to Home Screen" steps instead.
 */
export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(isStandalone())

  useEffect(() => {
    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    function onAppInstalled() {
      setInstalled(true)
      setDeferredPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onAppInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
    }
  }, [])

  async function promptInstall() {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const choice = await deferredPrompt.userChoice
    if (choice.outcome === 'accepted') {
      setDeferredPrompt(null)
    }
  }

  return {
    installed,
    canPrompt: !!deferredPrompt,
    showIosInstructions: !installed && isIos(),
    promptInstall,
  }
}
