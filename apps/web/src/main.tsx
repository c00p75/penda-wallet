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

const queryClient = new QueryClient()

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
