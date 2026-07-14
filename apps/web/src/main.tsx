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

const queryClient = new QueryClient()

// Follow the system color scheme — the .dark class drives all theme tokens.
const darkMedia = window.matchMedia('(prefers-color-scheme: dark)')
function applyColorScheme() {
  document.documentElement.classList.toggle('dark', darkMedia.matches)
}
applyColorScheme()
darkMedia.addEventListener('change', applyColorScheme)

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
