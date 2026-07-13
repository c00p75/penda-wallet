import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase/client'

interface AuthState {
  session: Session | null
  isLoading: boolean
  init: () => () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  isLoading: true,
  init: () => {
    supabase.auth.getSession().then(({ data }) => {
      set({ session: data.session, isLoading: false })
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, isLoading: false })
    })

    return () => subscription.subscription.unsubscribe()
  },
}))
