import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { HeroBlob } from '@/components/ui/hero-blob'
import { CurrencyCombobox } from '@/components/CurrencyCombobox'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { useWalletStore } from '@/store/walletStore'
import { createMemory } from '@/features/memory/api'
import { createSavingsGoal } from '@/features/goals/api'
import { useUpdateProfile } from '@/features/profile/hooks'
import { PROFILE_MODES, type ProfileMode } from '@/features/profile/modes'
import { GENDER_OPTIONS, GOAL_OPTIONS, INCOME_RANGE_OPTIONS, type Gender, type IncomeRange, type PrimaryGoal } from '@/features/profile/onboardingOptions'
import { buildOnboardingMemories, parseHouseholdSize } from '@/features/profile/onboarding'
import { starterGoalFromPrimary } from '@/features/profile/starterFromGoal'
import { useCreateWallet } from './hooks'

const STEPS = ['wallet', 'about', 'goal', 'more'] as const
type Step = (typeof STEPS)[number]

function StepHeading({ bold, light }: { bold: string; light: string }) {
  return (
    <h1 className="text-center text-[2rem] leading-[1.1] tracking-tight text-foreground">
      <span className="font-bold">{bold}</span>
      <br />
      <span className="font-light">{light}</span>
    </h1>
  )
}

export function OnboardingScreen() {
  const userId = useAuthStore((s) => s.session?.user.id)
  const createWallet = useCreateWallet()
  const updateProfile = useUpdateProfile(userId)
  const setCurrentWalletId = useWalletStore((s) => s.setCurrentWalletId)

  const [stepIndex, setStepIndex] = useState(0)
  const step: Step = STEPS[stepIndex]

  const [name, setName] = useState('My Wallet')
  const [currency, setCurrency] = useState('USD')
  const [mode, setMode] = useState<ProfileMode>('individual')
  const [householdSizeRaw, setHouseholdSizeRaw] = useState('')
  const [primaryGoal, setPrimaryGoal] = useState<PrimaryGoal | null>(null)
  const [incomeRange, setIncomeRange] = useState<IncomeRange | null>(null)
  const [gender, setGender] = useState<Gender>('prefer_not_to_say')
  const [notificationOptIn, setNotificationOptIn] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  function goNext() {
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1))
  }
  function goBack() {
    setStepIndex((i) => Math.max(i - 1, 0))
  }

  async function handleFinish() {
    setSubmitting(true)
    try {
      const wallet = await createWallet.mutateAsync({ name: name.trim(), baseCurrency: currency })

      const householdSize = mode === 'individual' ? null : parseHouseholdSize(householdSizeRaw)
      await updateProfile.mutateAsync({
        mode,
        household_size: householdSize,
        primary_goal: primaryGoal,
        income_range: incomeRange,
        gender,
        notification_opt_in: notificationOptIn,
      })

      try {
        const memories = buildOnboardingMemories({ mode, householdSize, primaryGoal, incomeRange, gender }, wallet.id)
        await Promise.all(memories.map((m) => createMemory(userId!, m)))
      } catch {
        // Best-effort enrichment — never block onboarding completion on this.
      }

      try {
        const starter = starterGoalFromPrimary(primaryGoal)
        if (starter) await createSavingsGoal(wallet.id, starter, 0)
      } catch {
        // Starter goal is optional — user can create one later.
      }

      setCurrentWalletId(wallet.id)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not finish setting up your wallet.')
      setSubmitting(false)
    }
  }

  const householdLabel = mode === 'business' ? 'Team size' : 'Household size'

  return (
    <main className="relative mx-auto flex min-h-svh max-w-md flex-col justify-center gap-6 overflow-hidden bg-background px-4 pb-10 pt-[max(2rem,env(safe-area-inset-top))]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div
          className="absolute -top-20 -right-10 size-64 rounded-full opacity-70 blur-3xl"
          style={{ background: 'radial-gradient(circle, var(--iris-soft), transparent 70%)' }}
        />
        <div
          className="absolute -bottom-16 -left-12 size-56 rounded-full opacity-60 blur-3xl"
          style={{ background: 'radial-gradient(circle, var(--apricot-soft), transparent 70%)' }}
        />
        <HeroBlob tone="mint" className="absolute top-8 right-4 size-24 opacity-40" />
      </div>

      <div className="relative flex flex-col items-center gap-2 text-center">
        <span className="rounded-full bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-[var(--shadow-soft)] ring-1 ring-border/50">
          Welcome to Penda
        </span>
        <div className="flex gap-1.5">
          {STEPS.map((s) => (
            <span
              key={s}
              className={cn('h-1.5 w-6 rounded-full transition-colors', s === step ? 'bg-primary' : 'bg-muted')}
            />
          ))}
        </div>
      </div>

      {step === 'wallet' && (
        <div className="relative flex flex-col gap-4 rounded-3xl bg-card p-5 shadow-[var(--shadow-card)] ring-1 ring-border/50">
          <div className="flex flex-col items-center gap-2 text-center">
            <StepHeading bold="Set up" light="your wallet" />
            <p className="text-sm text-muted-foreground">
              This is where your transactions, budgets, and goals will live. You can add more
              wallets or invite others later.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="onboarding-wallet-name">Wallet name</Label>
            <Input
              id="onboarding-wallet-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Wallet"
              className="rounded-2xl"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="onboarding-currency">Currency</Label>
            <CurrencyCombobox id="onboarding-currency" value={currency} onChange={setCurrency} />
          </div>
          <Button onClick={goNext} disabled={!name.trim()} className="rounded-full">
            Next
          </Button>
        </div>
      )}

      {step === 'about' && (
        <div className="relative flex flex-col gap-4 rounded-3xl bg-card p-5 shadow-[var(--shadow-card)] ring-1 ring-border/50">
          <div className="flex flex-col items-center gap-2 text-center">
            <StepHeading bold="Who's this" light="for?" />
            <p className="text-sm text-muted-foreground">
              Changes the wording and how Penda frames advice. You can change this later in
              Settings.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {PROFILE_MODES.map((m) => {
              const active = mode === m.value
              return (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMode(m.value)}
                  aria-pressed={active}
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-xl border px-2 py-2.5 text-center transition-colors',
                    active
                      ? 'border-primary bg-[var(--iris-soft)]'
                      : 'border-border/60 bg-background hover:bg-muted/50',
                  )}
                >
                  <span
                    className={cn(
                      'grid size-8 place-items-center rounded-lg',
                      active ? 'bg-background/80 text-[var(--iris)]' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    <m.icon weight="duotone" className="size-4" />
                  </span>
                  <span className="text-xs font-medium leading-none">{m.label}</span>
                </button>
              )
            })}
          </div>
          {mode !== 'individual' && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="onboarding-household-size">{householdLabel} (optional)</Label>
              <Input
                id="onboarding-household-size"
                type="number"
                min={1}
                max={50}
                value={householdSizeRaw}
                onChange={(e) => setHouseholdSizeRaw(e.target.value)}
                placeholder="e.g. 4"
                className="rounded-2xl"
              />
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={goBack} className="flex-1 rounded-full">
              Back
            </Button>
            <Button onClick={goNext} className="flex-1 rounded-full">
              Next
            </Button>
          </div>
        </div>
      )}

      {step === 'goal' && (
        <div className="relative flex flex-col gap-4 rounded-3xl bg-card p-5 shadow-[var(--shadow-card)] ring-1 ring-border/50">
          <div className="flex flex-col items-center gap-2 text-center">
            <StepHeading bold="What matters" light="most right now?" />
            <p className="text-sm text-muted-foreground">Optional — helps Penda's advice stay relevant.</p>
          </div>
          <div className="flex flex-col gap-2">
            {GOAL_OPTIONS.map((g) => {
              const active = primaryGoal === g.value
              return (
                <button
                  key={g.value}
                  type="button"
                  onClick={() => setPrimaryGoal(active ? null : g.value)}
                  aria-pressed={active}
                  className={cn(
                    'flex flex-col gap-0.5 rounded-2xl border p-3 text-left transition-colors',
                    active ? 'border-primary bg-[var(--iris-soft)]' : 'border-border/60 bg-background',
                  )}
                >
                  <span className="text-sm font-medium">{g.label}</span>
                  <span className="text-xs text-muted-foreground">{g.description}</span>
                </button>
              )
            })}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={goBack} className="flex-1 rounded-full">
              Back
            </Button>
            <Button onClick={goNext} className="flex-1 rounded-full">
              Next
            </Button>
          </div>
        </div>
      )}

      {step === 'more' && (
        <div className="relative flex flex-col gap-4 rounded-3xl bg-card p-5 shadow-[var(--shadow-card)] ring-1 ring-border/50">
          <div className="flex flex-col items-center gap-2 text-center">
            <StepHeading bold="A bit more" light="about you" />
            <p className="text-sm text-muted-foreground">All optional — skip anything you'd rather not share.</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>How would you describe your finances right now?</Label>
            <div className="grid grid-cols-2 gap-2">
              {INCOME_RANGE_OPTIONS.map((r) => {
                const active = incomeRange === r.value
                return (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setIncomeRange(active ? null : r.value)}
                    aria-pressed={active}
                    className={cn(
                      'rounded-2xl border p-2.5 text-center text-xs font-medium transition-colors',
                      active ? 'border-primary bg-[var(--iris-soft)]' : 'border-border/60 bg-background',
                    )}
                  >
                    {r.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Gender</Label>
            <div className="grid grid-cols-2 gap-2">
              {GENDER_OPTIONS.map((g) => {
                const active = gender === g.value
                return (
                  <button
                    key={g.value}
                    type="button"
                    onClick={() => setGender(g.value)}
                    aria-pressed={active}
                    className={cn(
                      'rounded-2xl border p-2.5 text-center text-xs font-medium transition-colors',
                      active ? 'border-primary bg-[var(--iris-soft)]' : 'border-border/60 bg-background',
                    )}
                  >
                    {g.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-background p-3">
            <p className="text-sm">Budget alerts &amp; bill reminders</p>
            <Switch checked={notificationOptIn} onCheckedChange={setNotificationOptIn} aria-label="Notifications" />
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={goBack} className="flex-1 rounded-full" disabled={submitting}>
              Back
            </Button>
            <Button onClick={handleFinish} className="flex-1 rounded-full" disabled={submitting}>
              Get started
            </Button>
          </div>
        </div>
      )}
    </main>
  )
}
