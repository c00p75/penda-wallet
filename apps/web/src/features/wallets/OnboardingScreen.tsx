import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
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
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-6 bg-background p-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
          Welcome to Penda
        </span>
        <div className="flex gap-1.5">
          {STEPS.map((s) => (
            <span
              key={s}
              className={cn('h-1.5 w-6 rounded-full', s === step ? 'bg-primary' : 'bg-muted')}
            />
          ))}
        </div>
      </div>

      {step === 'wallet' && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col items-center gap-2 text-center">
            <h1 className="text-2xl font-semibold">Let's set up your wallet</h1>
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
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="onboarding-currency">Currency</Label>
            <CurrencyCombobox id="onboarding-currency" value={currency} onChange={setCurrency} />
          </div>
          <Button onClick={goNext} disabled={!name.trim()}>
            Next
          </Button>
        </div>
      )}

      {step === 'about' && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col items-center gap-2 text-center">
            <h1 className="text-2xl font-semibold">Who's this for?</h1>
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
                    'flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center',
                    active ? 'border-primary bg-accent' : 'border-border',
                  )}
                >
                  <m.icon className={cn('size-5', active ? 'text-primary' : 'text-muted-foreground')} />
                  <span className="text-xs font-medium">{m.label}</span>
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
              />
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={goBack} className="flex-1">
              Back
            </Button>
            <Button onClick={goNext} className="flex-1">
              Next
            </Button>
          </div>
        </div>
      )}

      {step === 'goal' && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col items-center gap-2 text-center">
            <h1 className="text-2xl font-semibold">What matters most right now?</h1>
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
                    'flex flex-col gap-0.5 rounded-xl border p-3 text-left',
                    active ? 'border-primary bg-accent' : 'border-border',
                  )}
                >
                  <span className="text-sm font-medium">{g.label}</span>
                  <span className="text-xs text-muted-foreground">{g.description}</span>
                </button>
              )
            })}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={goBack} className="flex-1">
              Back
            </Button>
            <Button onClick={goNext} className="flex-1">
              Next
            </Button>
          </div>
        </div>
      )}

      {step === 'more' && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col items-center gap-2 text-center">
            <h1 className="text-2xl font-semibold">A bit more about you</h1>
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
                      'rounded-xl border p-2.5 text-center text-xs font-medium',
                      active ? 'border-primary bg-accent' : 'border-border',
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
                      'rounded-xl border p-2.5 text-center text-xs font-medium',
                      active ? 'border-primary bg-accent' : 'border-border',
                    )}
                  >
                    {g.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border p-3">
            <p className="text-sm">Budget alerts &amp; bill reminders</p>
            <Switch checked={notificationOptIn} onCheckedChange={setNotificationOptIn} aria-label="Notifications" />
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={goBack} className="flex-1" disabled={submitting}>
              Back
            </Button>
            <Button onClick={handleFinish} className="flex-1" disabled={submitting}>
              Get started
            </Button>
          </div>
        </div>
      )}
    </main>
  )
}
