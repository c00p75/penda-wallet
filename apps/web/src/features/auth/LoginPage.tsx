import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AiOrb } from '@/components/AiInsight'

// SVG logos
function GoogleLogo() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}

function AppleLogo() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" aria-hidden fill="currentColor">
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.43c1.29.06 2.16.67 2.92.69.9-.15 1.76-.76 3.04-.82 1.55-.08 2.97.62 3.78 1.74-3.44 2.07-2.87 6.65.92 7.93-.42 1.08-.97 2.14-2.66 3.31zM12.03 7.25c-.17-2.63 2.07-4.82 4.72-4.75.19 2.98-2.73 5.08-4.72 4.75z" />
    </svg>
  )
}

export function LoginPage() {
  const session = useAuthStore((s) => s.session)
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  if (session) {
    return <Navigate to="/" replace />
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setStatus('sending')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    if (error) {
      setErrorMessage(error.message)
      setStatus('error')
    } else {
      setStatus('sent')
    }
  }

  async function handleOAuth(provider: 'apple' | 'google') {
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    })
  }

  return (
    <main
      className="relative flex min-h-svh flex-col items-center justify-between overflow-hidden p-6"
      style={{
        background:
          'radial-gradient(ellipse 80% 55% at 60% 0%, color-mix(in oklch, var(--hero-glow) 50%, transparent) 0%, transparent 70%), linear-gradient(160deg, var(--hero-from) 0%, var(--hero-via) 55%, var(--hero-to) 100%)',
      }}
    >
      {/* Top hero */}
      <div className="flex flex-1 flex-col items-center justify-center gap-6 pt-12 text-center">
        {/* Orb + wordmark */}
        <div className="flex flex-col items-center gap-4">
          <div className="relative flex size-20 items-center justify-center">
            <div
              className="absolute inset-0 rounded-full opacity-40 blur-xl"
              style={{ background: 'conic-gradient(from 210deg, var(--iris), var(--hero-glow), var(--apricot), var(--iris))' }}
            />
            <AiOrb tone="default" className="size-14 relative" />
          </div>

          <div>
            <h1 className="text-4xl font-bold tracking-tight text-foreground">Penda</h1>
            <p className="mt-1 text-sm font-medium text-foreground/50">Your money, finally understood.</p>
          </div>
        </div>

        {/* Persona quotes — static preview */}
        <div className="flex flex-col gap-2 w-full max-w-xs">
          {[
            { text: "You're K600 ahead of last month \u2014 steady wins like this add up.", name: 'Amara' },
            { text: "No stress \u2014 you've still got K600 for the weekend. Enjoy it.", name: 'Kabwe' },
          ].map((q) => (
            <div
              key={q.name}
              className="rounded-2xl border border-foreground/8 bg-foreground/6 px-4 py-3 text-left backdrop-blur-sm"
            >
              <p className="text-xs leading-relaxed text-foreground/60">"{q.text}"</p>
              <p className="mt-1 text-[10px] font-medium text-foreground/30">— {q.name}, Penda AI</p>
            </div>
          ))}
        </div>
      </div>

      {/* Auth card */}
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-3 rounded-3xl border border-foreground/10 bg-foreground/6 p-5 backdrop-blur-xl">
          {/* OAuth buttons */}
          <button
            type="button"
            onClick={() => handleOAuth('google')}
            className="flex h-12 items-center justify-center gap-2.5 rounded-2xl bg-white text-sm font-semibold text-gray-800 shadow-sm transition-opacity hover:opacity-90 active:opacity-80"
          >
            <GoogleLogo />
            Continue with Google
          </button>

          <button
            type="button"
            onClick={() => handleOAuth('apple')}
            className="flex h-12 items-center justify-center gap-2.5 rounded-2xl bg-black text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 active:opacity-80"
          >
            <AppleLogo />
            Continue with Apple
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 text-xs text-foreground/30">
            <div className="h-px flex-1 bg-foreground/10" />
            or continue with email
            <div className="h-px flex-1 bg-foreground/10" />
          </div>

          {/* Magic link */}
          {status === 'sent' ? (
            <div className="rounded-2xl border border-foreground/10 bg-foreground/6 p-4 text-center">
              <p className="text-sm text-foreground/70">
                Check <span className="font-semibold text-foreground">{email}</span> for a sign-in link.
              </p>
            </div>
          ) : (
            <form onSubmit={handleMagicLink} className="flex flex-col gap-2.5">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email" className="text-xs font-medium text-foreground/50">
                  Email address
                </Label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="h-11 rounded-xl border-foreground/15 bg-foreground/8 text-foreground placeholder:text-foreground/25 focus:border-primary focus:bg-foreground/10"
                />
              </div>
              {status === 'error' && (
                <p className="text-xs text-[var(--rose)]">{errorMessage}</p>
              )}
              <Button
                type="submit"
                disabled={status === 'sending'}
                className="h-11 w-full rounded-xl font-semibold"
              >
                {status === 'sending' ? 'Sending link…' : 'Send magic link'}
              </Button>
            </form>
          )}
        </div>

        <p className="mt-4 text-center text-[11px] text-foreground/25">
          By continuing, you agree to Penda's Terms of Service and Privacy Policy.
        </p>
      </div>
    </main>
  )
}
