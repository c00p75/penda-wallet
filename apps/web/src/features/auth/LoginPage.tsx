import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const MIN_PASSWORD_LENGTH = 8

type AuthMode = 'signin' | 'signup' | 'forgot'
type Status = 'idle' | 'loading' | 'sent' | 'error'

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

// Four-point sparkle used as graphic decoration on the hero panel.
function Sparkle({
  className,
  color,
  rotate = 0,
  twinkle = true,
  durationMs = 4000,
  delayMs = 0,
}: {
  className?: string
  color: string
  rotate?: number
  twinkle?: boolean
  durationMs?: number
  delayMs?: number
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={`${twinkle ? 'penda-sparkle' : ''} ${className ?? ''}`}
      style={
        {
          color,
          transform: rotate ? `rotate(${rotate}deg)` : undefined,
          '--twinkle-dur': `${durationMs}ms`,
          '--twinkle-delay': `${delayMs}ms`,
        } as React.CSSProperties
      }
    >
      <path
        d="M12 0c.9 6.6 4.5 10.2 12 12-7.5 1.8-11.1 5.4-12 12-.9-6.6-4.5-10.2-12-12 7.5-1.8 11.1-5.4 12-12Z"
        fill="currentColor"
      />
    </svg>
  )
}

function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
  }
  return null
}

export function LoginPage() {
  const session = useAuthStore((s) => s.session)
  const [mode, setMode] = useState<AuthMode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [infoMessage, setInfoMessage] = useState('')

  if (session) {
    return <Navigate to="/" replace />
  }

  function switchMode(next: AuthMode) {
    setMode(next)
    setStatus('idle')
    setErrorMessage('')
    setInfoMessage('')
    setPassword('')
    setConfirmPassword('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMessage('')
    setInfoMessage('')
    setStatus('loading')

    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      setErrorMessage('Enter your email address.')
      setStatus('error')
      return
    }

    if (mode === 'forgot') {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: `${window.location.origin}/login`,
      })
      if (error) {
        setErrorMessage(error.message)
        setStatus('error')
        return
      }
      setInfoMessage(`Password reset link sent to ${trimmedEmail}.`)
      setStatus('sent')
      return
    }

    const passwordError = validatePassword(password)
    if (passwordError) {
      setErrorMessage(passwordError)
      setStatus('error')
      return
    }

    if (mode === 'signup') {
      if (password !== confirmPassword) {
        setErrorMessage('Passwords do not match.')
        setStatus('error')
        return
      }

      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: { emailRedirectTo: window.location.origin },
      })
      if (error) {
        setErrorMessage(error.message)
        setStatus('error')
        return
      }
      // Confirmations enabled: no session until the user verifies email.
      if (!data.session) {
        setInfoMessage(`Check ${trimmedEmail} to confirm your account, then sign in.`)
        setStatus('sent')
        return
      }
      setStatus('idle')
      return
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    })
    if (error) {
      setErrorMessage(error.message)
      setStatus('error')
      return
    }
    setStatus('idle')
  }

  async function handleOAuth(provider: 'google') {
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    })
  }

  const submitLabel =
    status === 'loading'
      ? mode === 'forgot'
        ? 'Sending…'
        : mode === 'signup'
          ? 'Creating account…'
          : 'Signing in…'
      : mode === 'forgot'
        ? 'Send reset link'
        : mode === 'signup'
          ? 'Create account'
          : 'Sign in'

  return (
    <main className="flex min-h-svh flex-col gap-5 bg-background px-5 pb-8 pt-[max(1rem,env(safe-area-inset-top))]">
      {/* Hero panel */}
      <section
        className="relative flex flex-1 flex-col overflow-hidden rounded-[2rem] p-7 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95"
        style={{
          background:
            'radial-gradient(120% 90% at 80% 15%, color-mix(in oklch, var(--hero-glow) 55%, transparent), transparent 60%), linear-gradient(155deg, var(--hero-via) 0%, var(--hero-to) 100%)',
          animationDuration: '600ms',
        }}
      >
        {/* Corner sparkles, kept clear of the headline */}
        <Sparkle twinkle={false} color="rgba(255,255,255,0.9)" rotate={10} className="absolute right-7 top-10 size-12" />
        <Sparkle twinkle={false} color="rgba(255,255,255,0.85)" className="absolute bottom-10 right-10 size-7" />
        <Sparkle color="var(--iris)" durationMs={3600} className="absolute right-6 top-28 size-4 opacity-80" />

        {/* Content */}
        <div className="relative z-10 flex items-center gap-1.5 text-sm font-semibold tracking-wide text-foreground/70">
          Penda
          <Sparkle color="var(--iris)" durationMs={3200} className="size-3.5" />
        </div>

        <h1 className="relative z-10 mt-6 text-[2.6rem] font-bold leading-[1.08] tracking-tight text-foreground">
          Your money,
          <br />
          finally
          <br />
          understood.
        </h1>
        <p className="relative z-10 mt-3.5 max-w-[16rem] text-[15px] font-medium leading-relaxed text-foreground/55">
          Meet Penda, your private AI money companion.
        </p>

        {/* Big graphic star, flows below the copy (never behind the headline) and bleeds off the panel edge */}
        <div className="relative z-0 mt-auto -mb-3 -ml-1 pt-6">
          <Sparkle twinkle={false} color="var(--foreground)" rotate={-8} className="size-24 opacity-90" />
        </div>
      </section>

      {/* Auth actions */}
      <div className="flex flex-col gap-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4" style={{ animationDuration: '600ms' }}>
        {mode !== 'forgot' && (
          <button
            type="button"
            onClick={() => handleOAuth('google')}
            className="flex h-13 items-center justify-center gap-2.5 rounded-2xl border border-border/60 bg-white text-sm font-semibold text-gray-800 shadow-[var(--shadow-soft)] outline-none transition-all hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-[0.98] dark:border-transparent dark:bg-card dark:text-foreground"
          >
            <GoogleLogo />
            Continue with Google
          </button>
        )}

        {mode !== 'forgot' && (
          <div className="flex items-center gap-3 py-0.5 text-xs text-muted-foreground/70">
            <div className="h-px flex-1 bg-border/80" />
            or continue with email
            <div className="h-px flex-1 bg-border/80" />
          </div>
        )}

        {status === 'sent' ? (
          <div className="rounded-2xl border border-[var(--mint)]/35 bg-[var(--mint-soft)]/70 p-4 text-center">
            <p className="text-sm text-foreground/80">{infoMessage}</p>
            <button
              type="button"
              onClick={() => switchMode('signin')}
              className="mt-3 text-xs font-semibold text-foreground underline-offset-2 hover:underline"
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
            {mode === 'forgot' && (
              <p className="text-sm text-muted-foreground">
                Enter your email and we&apos;ll send a link to reset your password.
              </p>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email" className="text-xs font-medium text-muted-foreground">
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
                className="h-12 rounded-2xl border-border/80 bg-background text-foreground shadow-sm placeholder:text-muted-foreground/50 focus:border-primary"
              />
            </div>

            {mode !== 'forgot' && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="password" className="text-xs font-medium text-muted-foreground">
                    Password
                  </Label>
                  {mode === 'signin' && (
                    <button
                      type="button"
                      onClick={() => switchMode('forgot')}
                      className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <Input
                  id="password"
                  type="password"
                  required
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                  className="h-12 rounded-2xl border-border/80 bg-background text-foreground shadow-sm placeholder:text-muted-foreground/50 focus:border-primary"
                />
              </div>
            )}

            {mode === 'signup' && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="confirm-password" className="text-xs font-medium text-muted-foreground">
                  Confirm password
                </Label>
                <Input
                  id="confirm-password"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="h-12 rounded-2xl border-border/80 bg-background text-foreground shadow-sm placeholder:text-muted-foreground/50 focus:border-primary"
                />
              </div>
            )}

            {status === 'error' && <p className="text-xs font-medium text-[var(--rose)]">{errorMessage}</p>}

            <Button type="submit" disabled={status === 'loading'} className="h-12 w-full rounded-2xl font-semibold shadow-[var(--shadow-soft)]">
              {submitLabel}
            </Button>
          </form>
        )}

        {status !== 'sent' && (
          <p className="text-center text-xs text-muted-foreground">
            {mode === 'signin' && (
              <>
                Don&apos;t have an account?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('signup')}
                  className="font-semibold text-foreground underline-offset-2 hover:underline"
                >
                  Sign up
                </button>
              </>
            )}
            {mode === 'signup' && (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('signin')}
                  className="font-semibold text-foreground underline-offset-2 hover:underline"
                >
                  Sign in
                </button>
              </>
            )}
            {mode === 'forgot' && (
              <button
                type="button"
                onClick={() => switchMode('signin')}
                className="font-semibold text-foreground underline-offset-2 hover:underline"
              >
                Back to sign in
              </button>
            )}
          </p>
        )}

        <p className="mt-1 text-center text-[11px] text-muted-foreground/80">
          By continuing, you agree to Penda&apos;s Terms of Service and Privacy Policy.
        </p>
      </div>
    </main>
  )
}
