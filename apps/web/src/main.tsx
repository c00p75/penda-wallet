import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { registerSW } from 'virtual:pwa-register'
import { toast } from 'sonner'
import './index.css'
import App from './App.tsx'
import { Toaster } from '@/components/ui/sonner'
import { useAuthStore } from '@/store/authStore'
import { useThemeStore } from '@/store/themeStore'
import { initInstallCapture } from '@/pwa/installStore'

const queryClient = new QueryClient()

// `beforeinstallprompt` fires once, early — capture it before React mounts so
// the install offer survives navigation and never gets missed.
initInstallCapture()

// The .dark class drives every theme token. Mode 'system' follows the OS
// setting live; 'light'/'dark' pin it regardless of the OS.
const darkMedia = window.matchMedia('(prefers-color-scheme: dark)')
function applyTheme() {
  const { mode } = useThemeStore.getState()
  const isDark = mode === 'dark' || (mode === 'system' && darkMedia.matches)
  document.documentElement.classList.toggle('dark', isDark)
}
applyTheme()
darkMedia.addEventListener('change', applyTheme)
useThemeStore.subscribe(applyTheme)

// Fade out the inlined boot splash (see index.html) once auth boot resolves.
// A short floor keeps it from flickering on a warm/instant load; a hard cap
// guarantees it never gets stuck if the session never resolves (e.g. offline).
const SPLASH_MIN_MS = 1400
const SPLASH_MAX_MS = 4000
const splashStart = performance.now()
let splashHidden = false

function hideBootSplash() {
  if (splashHidden) return
  splashHidden = true
  const el = document.getElementById('boot-splash')
  if (!el) return
  el.classList.add('bs-hidden')
  const remove = () => el.remove()
  el.addEventListener('transitionend', remove, { once: true })
  window.setTimeout(remove, 800) // fallback if transitionend never fires
}

function maybeHideSplash() {
  if (useAuthStore.getState().isLoading) return
  const wait = Math.max(0, SPLASH_MIN_MS - (performance.now() - splashStart))
  window.setTimeout(hideBootSplash, wait)
}

const stopSplashWatch = useAuthStore.subscribe(() => {
  if (!useAuthStore.getState().isLoading) {
    stopSplashWatch()
    maybeHideSplash()
  }
})
window.setTimeout(hideBootSplash, SPLASH_MAX_MS)

const updateSW = registerSW({
  onNeedRefresh() {
    toast('A new version of Penda is available.', {
      action: { label: 'Reload', onClick: () => updateSW(true) },
      duration: Infinity,
    })
  },
  onOfflineReady() {
    toast('Penda is ready to work offline.')
  },
})

function Root() {
  useEffect(() => useAuthStore.getState().init(), [])

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
      <Toaster />
    </QueryClientProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
