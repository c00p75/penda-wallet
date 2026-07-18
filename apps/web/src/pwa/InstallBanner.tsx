import { useState } from 'react'
import { Download, Share, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useInstallPrompt } from './useInstallPrompt'

/**
 * Prominent, dismissible home-screen install offer. Renders only when the app
 * can actually be installed — a native prompt is ready (Android/desktop) or we
 * can show iOS's manual steps — and disappears once installed or dismissed.
 */
export function InstallBanner() {
  const { installed, canPrompt, showIosInstructions, dismissed, promptInstall, dismiss } = useInstallPrompt()
  const [showIosSteps, setShowIosSteps] = useState(false)

  if (installed || dismissed) return null
  if (!canPrompt && !showIosInstructions) return null

  return (
    <div className="relative overflow-hidden rounded-[1.5rem] border border-border/60 bg-card p-4 shadow-[var(--shadow-soft)] ring-1 ring-border/40 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 motion-safe:duration-300">
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss install banner"
        className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-2xl text-muted-foreground transition-all hover:bg-accent/60 active:scale-95"
      >
        <X className="size-4" />
      </button>

      <div className="flex items-center gap-3 pr-6">
        <img src="/icons/icon-192.png" alt="" className="size-11 shrink-0 rounded-2xl shadow-[var(--shadow-soft)] ring-1 ring-border/50" />
        <div className="flex flex-col">
          <p className="text-sm font-semibold">Install Penda</p>
          <p className="text-xs text-muted-foreground">One tap from your home screen. Works offline.</p>
        </div>
      </div>

      {canPrompt ? (
        <Button onClick={promptInstall} className="mt-3 w-full">
          <Download className="size-4" />
          Add to home screen
        </Button>
      ) : showIosSteps ? (
        <div className="mt-3 flex flex-col gap-1 rounded-2xl bg-[var(--iris-soft)]/60 p-3.5 text-sm text-foreground/75 ring-1 ring-[var(--iris)]/15">
          <p className="flex items-center gap-1.5">
            1. Tap <Share className="inline size-4" /> Share in Safari
          </p>
          <p>2. Choose "Add to Home Screen"</p>
        </div>
      ) : (
        <Button variant="outline" onClick={() => setShowIosSteps(true)} className="mt-3 w-full">
          <Share className="size-4" />
          How to install
        </Button>
      )}
    </div>
  )
}
