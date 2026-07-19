import { create } from 'zustand'

/**
 * UI gate for the interactive onboarding walkthrough. Persisted phase lives in
 * localStorage (gettingStarted.ts); this store forces Home to remount when
 * the walkthrough starts or finishes.
 */
interface OnboardingUiState {
  walkthroughActive: boolean
  setWalkthroughActive: (active: boolean) => void
}

export const useOnboardingStore = create<OnboardingUiState>((set) => ({
  walkthroughActive: false,
  setWalkthroughActive: (walkthroughActive) => set({ walkthroughActive }),
}))
