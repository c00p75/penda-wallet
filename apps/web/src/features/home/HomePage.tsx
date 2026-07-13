import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

export function HomePage() {
  const session = useAuthStore((s) => s.session)
  const isLoading = useAuthStore((s) => s.isLoading)

  if (isLoading) {
    return null
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Penda</h1>
        <Button variant="ghost" size="sm" onClick={() => supabase.auth.signOut()}>
          Sign out
        </Button>
      </header>
      <p className="text-sm text-muted-foreground">
        Signed in as {session.user.email}. The ledger, chat, and budgets land in the next build
        phases.
      </p>
    </div>
  )
}
