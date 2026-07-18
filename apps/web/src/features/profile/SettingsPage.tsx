import { useEffect, useState, type ReactNode } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Check, ChevronRight } from 'lucide-react'
import {
  Bell,
  Briefcase,
  ClipboardText,
  ClockCounterClockwise,
  Download,
  Lock,
  Monitor,
  Moon,
  Path,
  ShareNetwork,
  DeviceMobile,
  SignOut,
  Sparkle,
  Sun,
  Users,
  type Icon,
} from '@/components/icons/product'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { BottomNav } from '@/components/BottomNav'
import { PageHeader } from '@/components/PageHeader'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { useLockStore } from '@/store/lockStore'
import { SetupLockSheet } from '@/features/lock/SetupLockSheet'
import { ConfirmDisableLockSheet } from '@/features/lock/ConfirmDisableLockSheet'
import { DeleteAccountDialog } from '@/features/account/DeleteAccountDialog'
import { useThemeStore, type ThemeMode } from '@/store/themeStore'
import { supabase } from '@/lib/supabase/client'
import { useInstallPrompt } from '@/pwa/useInstallPrompt'
import { useEntitlement } from '@/features/entitlements/hooks'
import { useCurrentWallet } from '@/features/wallets/hooks'
import { CategoryManager } from '@/features/categories/CategoryManager'
import { useExport } from '@/features/export/useExport'
import {
  useSubscribeToPush,
  useUnsubscribeFromPush,
} from '@/features/notifications/hooks'
import type { NotificationPrefs } from '@/features/notifications/prefs'
import { useSavingsGoals } from '@/features/goals/hooks'
import { useProfile, useUpdateProfile } from './hooks'
import { PersonaAvatar } from './PersonaAvatar'
import {
  DEFAULT_AI_CONSENT,
  DEFAULT_NOTIFICATION_PREFS,
  PERSONALITIES,
  type AiConsent,
  type AiPersonality,
} from './types'
import { PROFILE_MODES, type ProfileMode } from './modes'

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: Icon }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

export function SettingsPage() {
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-5 bg-background px-4 pb-24 pt-[max(1rem,env(safe-area-inset-top))]">
      <PageHeader title="Settings" subtitle="Tune Penda to how you live" />
      <SettingsContent />
      <BottomNav />
    </main>
  )
}

type SettingsContentProps = {
  /** Optional wallet panel — shown as its own tab on Profile. */
  walletPanel?: ReactNode
}

/** The actual settings UI, shared between the standalone page and Profile. */
export function SettingsContent({ walletPanel }: SettingsContentProps) {
  const session = useAuthStore((s) => s.session)
  const userId = session?.user.id
  const { data: profile } = useProfile(userId)
  const updateProfile = useUpdateProfile(userId)
  const install = useInstallPrompt()
  const { isPremium } = useEntitlement(userId)
  const { data: wallet } = useCurrentWallet()
  const { data: goals = [] } = useSavingsGoals(wallet?.id)
  const { exportAs, isExporting } = useExport(wallet?.id)
  const themeMode = useThemeStore((s) => s.mode)
  const setThemeMode = useThemeStore((s) => s.setMode)

  const lockEnabled = useLockStore((s) => s.enabled)
  const lockHasBiometric = useLockStore((s) => !!s.credentialId)

  const [displayName, setDisplayName] = useState('')
  const [personality, setPersonality] = useState<AiPersonality>('balanced_coach')
  const [mode, setMode] = useState<ProfileMode>('individual')
  const [notificationOptIn, setNotificationOptIn] = useState(true)
  const [notificationPrefs, setNotificationPrefs] =
    useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS)
  const [aiConsent, setAiConsent] = useState<AiConsent>(DEFAULT_AI_CONSENT)
  const [blindBudgeting, setBlindBudgeting] = useState(false)
  const [roundUp, setRoundUp] = useState(false)
  const [payYourselfFirst, setPayYourselfFirst] = useState('0')
  const [taxReserve, setTaxReserve] = useState('0')
  const [habitsGoalId, setHabitsGoalId] = useState<string>('')
  const [setupLockOpen, setSetupLockOpen] = useState(false)
  const [disableLockOpen, setDisableLockOpen] = useState(false)
  const subscribeToPush = useSubscribeToPush()
  const unsubscribeFromPush = useUnsubscribeFromPush()
  const pushBusy = subscribeToPush.isPending || unsubscribeFromPush.isPending

  useEffect(() => {
    if (!profile) return
    setDisplayName(profile.display_name ?? '')
    setPersonality(profile.ai_personality)
    setMode(profile.mode)
    setNotificationOptIn(profile.notification_opt_in)
    setNotificationPrefs(profile.notification_prefs ?? DEFAULT_NOTIFICATION_PREFS)
    setAiConsent(profile.ai_consent ?? DEFAULT_AI_CONSENT)
    setBlindBudgeting(profile.blind_budgeting)
    setRoundUp(profile.round_up_enabled)
    setPayYourselfFirst(String(profile.pay_yourself_first_pct ?? 0))
    setTaxReserve(String(profile.tax_reserve_pct ?? 0))
    setHabitsGoalId(profile.habits_goal_id ?? '')
  }, [profile])

  if (!session) return <Navigate to="/login" replace />

  async function handleSave() {
    const pyf = Number(payYourselfFirst)
    const tax = Number(taxReserve)
    if (Number.isNaN(pyf) || pyf < 0 || pyf > 50) {
      toast.error('Pay-yourself-first must be between 0 and 50%.')
      return
    }
    if (Number.isNaN(tax) || tax < 0 || tax > 50) {
      toast.error('Tax reserve must be between 0 and 50%.')
      return
    }
    try {
      const trustPatch =
        !aiConsent.act_without_confirm && profile?.ai_trust
          ? { ...profile.ai_trust, auto_loose: false }
          : undefined
      await updateProfile.mutateAsync({
        display_name: displayName.trim() || null,
        ai_personality: personality,
        mode,
        notification_opt_in: notificationOptIn,
        notification_prefs: notificationPrefs,
        ai_consent: aiConsent,
        ...(trustPatch ? { ai_trust: trustPatch } : {}),
        blind_budgeting: blindBudgeting,
        round_up_enabled: roundUp,
        pay_yourself_first_pct: pyf,
        tax_reserve_pct: tax,
        habits_goal_id: habitsGoalId || null,
      })
      toast('Settings saved.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  const dirty =
    !!profile &&
    (displayName !== (profile.display_name ?? '') ||
      personality !== profile.ai_personality ||
      mode !== profile.mode ||
      notificationOptIn !== profile.notification_opt_in ||
      JSON.stringify(notificationPrefs) !==
        JSON.stringify(profile.notification_prefs ?? DEFAULT_NOTIFICATION_PREFS) ||
      JSON.stringify(aiConsent) !== JSON.stringify(profile.ai_consent ?? DEFAULT_AI_CONSENT) ||
      blindBudgeting !== profile.blind_budgeting ||
      roundUp !== profile.round_up_enabled ||
      payYourselfFirst !== String(profile.pay_yourself_first_pct ?? 0) ||
      taxReserve !== String(profile.tax_reserve_pct ?? 0) ||
      habitsGoalId !== (profile.habits_goal_id ?? ''))

  function patchConsent(key: keyof AiConsent, value: boolean) {
    setAiConsent((c) => ({ ...c, [key]: value }))
  }

  return (
    <>
      <Tabs defaultValue="you" className="gap-4">
        <TabsList
          className={cn(
            'h-auto w-full',
            walletPanel ? 'grid grid-cols-5' : 'grid grid-cols-4',
          )}
        >
          <TabsTrigger value="you" className="px-1 text-xs sm:text-sm">
            You
          </TabsTrigger>
          {walletPanel && (
            <TabsTrigger value="wallet" className="px-1 text-xs sm:text-sm">
              Wallet
            </TabsTrigger>
          )}
          <TabsTrigger value="money" className="px-1 text-xs sm:text-sm">
            Money
          </TabsTrigger>
          <TabsTrigger value="ai" className="px-1 text-xs sm:text-sm">
            AI
          </TabsTrigger>
          <TabsTrigger value="account" className="px-1 text-xs sm:text-sm">
            Account
          </TabsTrigger>
        </TabsList>

        {walletPanel && (
          <TabsContent value="wallet" className="flex flex-col gap-4">
            {walletPanel}
          </TabsContent>
        )}

        <TabsContent value="you" className="flex flex-col gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Plan</CardTitle>
              <span
                className={
                  isPremium
                    ? 'flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground'
                    : 'rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground'
                }
              >
                {isPremium && <Sparkle className="size-3" weight="fill" />}
                {isPremium ? 'Premium' : 'Free'}
              </span>
            </CardHeader>
            {!isPremium && (
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Voice is free for everyone. Premium unlocks the depth: receipt scanning, weekly AI
                  insights history, and unlimited shared wallet members. Not available to purchase yet —
                  check back soon.
                </p>
              </CardContent>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Mode</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">
                Changes the wording and how Penda frames advice — the same money, seen your way.
              </p>
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
                          active ? 'bg-background/80 text-primary' : 'bg-muted text-muted-foreground',
                        )}
                      >
                        <m.icon weight="duotone" className="size-4" />
                      </span>
                      <span className="text-xs font-medium leading-none">{m.label}</span>
                    </button>
                  )
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                {PROFILE_MODES.find((m) => m.value === mode)?.description}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Profile</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="display-name">Display name</Label>
                <Input
                  id="display-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Shown to wallet members and on challenge leaderboards"
                />
              </div>
              <p className="text-xs text-muted-foreground">Signed in as {session.user.email}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Appearance</CardTitle>
            </CardHeader>
            <CardContent>
              <ToggleGroup
                type="single"
                value={themeMode}
                onValueChange={(v) => v && setThemeMode(v as ThemeMode)}
                className="w-full"
              >
                {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
                  <ToggleGroupItem key={value} value={value} className="flex-1 gap-1.5">
                    <Icon className="size-4" weight="duotone" />
                    {label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Lock className="size-4" weight="duotone" />
                Balance privacy
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <div className="flex min-h-12 items-center justify-between gap-3">
                <p className="text-sm font-medium">Hide exact balances until unlocked</p>
                <Switch
                  checked={lockEnabled}
                  onCheckedChange={(on) => (on ? setSetupLockOpen(true) : setDisableLockOpen(true))}
                  aria-label="Hide balances"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {lockEnabled
                  ? `On — reveal with ${lockHasBiometric ? 'biometrics or your PIN' : 'your PIN'}. Tap a hidden balance to unlock.`
                  : 'Balances stay masked on shared or lost phones. Your PIN is kept on this device only, never sent to Penda.'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notifications</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex min-h-12 items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Push on this device</p>
                  <p className="text-xs text-muted-foreground">
                    Budget alerts, bill reminders, and weekly recaps.
                  </p>
                </div>
                <Switch
                  checked={notificationOptIn}
                  disabled={pushBusy || !userId}
                  onCheckedChange={async (on) => {
                    if (!userId) return
                    const previous = notificationOptIn
                    setNotificationOptIn(on)
                    try {
                      if (on) {
                        await subscribeToPush.mutateAsync(userId)
                        toast('Push alerts enabled on this device.')
                      } else {
                        await unsubscribeFromPush.mutateAsync(userId)
                        toast('Push alerts turned off on this device.')
                      }
                    } catch (error) {
                      setNotificationOptIn(previous)
                      toast.error(
                        error instanceof Error ? error.message : 'Could not update notifications.',
                      )
                    }
                  }}
                  aria-label="Push notifications"
                />
              </div>
              {(
                [
                  ['reminders', 'Bill reminders'],
                  ['tips', 'Tips'],
                  ['morning_minute', 'Morning money-minute'],
                  ['insights', 'Weekly insights'],
                  ['annual_recap', 'Annual year-in-review'],
                  ['alerts', 'Budget alerts'],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="flex flex-col gap-1">
                  <div className="flex min-h-10 items-center justify-between gap-3">
                    <p className="text-sm">{label}</p>
                    <Switch
                      checked={notificationPrefs[key]}
                      onCheckedChange={(checked) =>
                        setNotificationPrefs((p) => ({ ...p, [key]: checked }))
                      }
                      aria-label={label}
                    />
                  </div>
                  {key === 'morning_minute' ? (
                    <p className="text-xs text-muted-foreground">
                      A short daily nudge with yesterday’s snapshot (needs Tips on).
                    </p>
                  ) : null}
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                Category toggles apply after you save. Push still requires permission on this device.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="money" className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Money habits</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex min-h-14 items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Blind budgeting</p>
                  <p className="text-xs text-muted-foreground">
                    Hide exact amounts — show calm auras instead
                  </p>
                </div>
                <Switch
                  checked={blindBudgeting}
                  onCheckedChange={setBlindBudgeting}
                  aria-label="Blind budgeting"
                />
              </div>
              <div className="flex min-h-14 items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Round-ups</p>
                  <p className="text-xs text-muted-foreground">
                    Save spare change to a goal on every expense
                  </p>
                </div>
                <Switch checked={roundUp} onCheckedChange={setRoundUp} aria-label="Round-ups" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pyf-pct">Pay yourself first %</Label>
                <Input
                  id="pyf-pct"
                  type="number"
                  min={0}
                  max={50}
                  step={1}
                  value={payYourselfFirst}
                  onChange={(e) => setPayYourselfFirst(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="habits-goal">Habits destination goal</Label>
                <select
                  id="habits-goal"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={habitsGoalId}
                  onChange={(e) => setHabitsGoalId(e.target.value)}
                >
                  <option value="">Auto — Round-ups &amp; savings</option>
                  {goals.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
                {(roundUp || Number(payYourselfFirst) > 0) && goals.length === 0 ? (
                  <div className="rounded-xl border border-border/70 bg-muted/40 px-3 py-2.5">
                    <p className="text-xs text-muted-foreground">
                      Create a savings goal so round-ups have a home
                    </p>
                    <Button asChild size="sm" variant="link" className="h-auto px-0 pt-1">
                      <Link to="/goals">Create a goal</Link>
                    </Button>
                  </div>
                ) : null}
                {(roundUp || Number(payYourselfFirst) > 0) &&
                goals.length > 0 &&
                !habitsGoalId ? (
                  <p className="text-xs text-muted-foreground">
                    Tip: pick a destination goal so round-ups land somewhere specific.
                  </p>
                ) : null}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tax-reserve-pct">Tax reserve %</Label>
                <Input
                  id="tax-reserve-pct"
                  type="number"
                  min={0}
                  max={50}
                  step={0.5}
                  value={taxReserve}
                  onChange={(e) => setTaxReserve(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Categories</CardTitle>
            </CardHeader>
            <CardContent>
              <CategoryManager walletId={wallet?.id} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai" className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">AI consent</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Plain-language controls for what Penda may do unprompted. After 10 confirmed
                updates/deletes with no undo, Penda graduates to act without asking — undo
                resets that trust.
              </p>
              {profile?.ai_trust?.auto_loose && aiConsent.act_without_confirm ? (
                <div
                  className="rounded-xl border px-3 py-2.5 text-xs leading-snug"
                  style={{
                    borderColor: 'var(--iris)',
                    background: 'color-mix(in srgb, var(--iris) 8%, var(--card))',
                    color: 'var(--foreground)',
                  }}
                >
                  Penda can act without asking — undo anytime in{' '}
                  <Link to="/ai-actions" className="font-medium underline underline-offset-2">
                    AI actions
                  </Link>
                  .
                </div>
              ) : null}
              {(
                [
                  ['unprompted_coaching', 'Unprompted coaching nudges'],
                  ['act_without_confirm', 'Act without confirming (updates/deletes)'],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="flex min-h-12 items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{label}</p>
                    {key === 'act_without_confirm' && profile?.ai_trust?.auto_loose ? (
                      <p className="text-xs text-muted-foreground">
                        Graduated from confirmed actions — turn off anytime to require asks again
                      </p>
                    ) : null}
                  </div>
                  <Switch
                    checked={aiConsent[key]}
                    onCheckedChange={(on) => patchConsent(key, on)}
                    aria-label={label}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Who should Penda be?</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2">
                {PERSONALITIES.map((p) => {
                  const active = personality === p.value
                  return (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setPersonality(p.value)}
                      className={cn(
                        'flex flex-col gap-2.5 rounded-2xl border p-3 text-left transition-shadow',
                        active ? 'shadow-md' : 'hover:shadow-sm',
                      )}
                      style={
                        active
                          ? {
                              borderColor: p.accent,
                              boxShadow: `0 0 0 1px ${p.accent}`,
                              background: `color-mix(in srgb, ${p.accent} 8%, var(--card))`,
                            }
                          : undefined
                      }
                      aria-pressed={active}
                    >
                      <div className="flex items-center gap-3">
                        <PersonaAvatar value={p.value} accent={p.accent} size={44} />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium leading-tight">{p.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {p.label} · {p.description}
                          </p>
                        </div>
                        {active && <Check className="size-4 shrink-0" style={{ color: p.accent }} />}
                      </div>
                      {active && (
                        <p className="rounded-xl bg-background/70 px-3 py-2 text-sm italic text-muted-foreground">
                          “{p.preview}”
                        </p>
                      )}
                    </button>
                  )
                })}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Changes how Penda talks to you in chat — never what it does with your money.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="account" className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">More</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              {(
                [
                  { to: '/notifications', label: 'Notifications', icon: Bell },
                  { to: '/activity', label: 'Activity log', icon: ClockCounterClockwise },
                  { to: '/ai-actions', label: 'AI action audit', icon: ClipboardText },
                  { to: '/missions', label: 'Missions', icon: Path },
                  { to: '/business', label: 'Business hub', icon: Briefcase },
                  { to: '/family', label: 'Family hub', icon: Users },
                ] as const
              ).map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  className="flex items-center gap-3 rounded-xl px-2 py-2.5 text-sm hover:bg-muted"
                >
                  <Icon className="size-4 text-muted-foreground" weight="duotone" />
                  <span className="flex-1">{label}</span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Install Penda</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {install.installed ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <DeviceMobile className="size-4" weight="duotone" /> Installed — you're using the
                  app.
                </p>
              ) : install.canPrompt ? (
                <Button variant="outline" onClick={install.promptInstall}>
                  <Download className="size-4" />
                  Add to home screen
                </Button>
              ) : install.showIosInstructions ? (
                <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                  <p className="flex items-center gap-1.5">
                    1. Tap <ShareNetwork className="inline size-4" weight="regular" /> Share in Safari
                  </p>
                  <p>2. Choose "Add to Home Screen"</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Open Penda in your phone's browser to install it as an app.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Export your data</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">
                Download this wallet's full financial history. It's your data.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => exportAs('json')}
                  disabled={isExporting}
                  className="flex-1 gap-1.5"
                >
                  <Download className="size-4" />
                  JSON
                </Button>
                <Button
                  variant="outline"
                  onClick={() => exportAs('csv')}
                  disabled={isExporting}
                  className="flex-1 gap-1.5"
                >
                  <Download className="size-4" />
                  CSV
                </Button>
              </div>
            </CardContent>
          </Card>

          <Button
            variant="outline"
            onClick={() => void supabase.auth.signOut()}
            className="w-full gap-2"
          >
            <SignOut className="size-4 text-[var(--rose)]" weight="duotone" />
            Sign out
          </Button>

          <Card className="border-[var(--rose-soft)]">
            <CardHeader>
              <CardTitle className="text-base text-[var(--rose)]">Danger zone</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-start gap-2">
              <p className="text-sm text-muted-foreground">
                Delete your account and all your data. Wallets you share with others stay with them.
              </p>
              <DeleteAccountDialog />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {dirty && (
        <div className="sticky bottom-20 z-10 pt-2">
          <Button onClick={handleSave} disabled={updateProfile.isPending} className="w-full">
            Save changes
          </Button>
        </div>
      )}

      <SetupLockSheet open={setupLockOpen} onOpenChange={setSetupLockOpen} />
      <ConfirmDisableLockSheet open={disableLockOpen} onOpenChange={setDisableLockOpen} />
    </>
  )
}
