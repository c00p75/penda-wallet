import { useSyncExternalStore } from 'react'
import {
  dismissInstall,
  getInstallSnapshot,
  promptInstall,
  subscribeInstall,
} from './installStore'

/**
 * Reactive view of the app's install state, backed by the module-level singleton
 * in installStore (which captures `beforeinstallprompt` at load, before any
 * component mounts). `promptInstall()` opens the native dialog where one exists
 * (Android/desktop Chrome); iOS has no such event, so `showIosInstructions`
 * signals the UI to render manual "Share → Add to Home Screen" steps instead.
 */
export function useInstallPrompt() {
  const snapshot = useSyncExternalStore(subscribeInstall, getInstallSnapshot, getInstallSnapshot)

  return {
    ...snapshot,
    promptInstall,
    dismiss: dismissInstall,
  }
}
