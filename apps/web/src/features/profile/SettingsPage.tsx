import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Check, Download, Monitor, Moon, Share, Smartphone, Sparkles, Sun } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { BottomNav } from '@/components/BottomNav'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { useThemeStore, type ThemeMode } from '@/store/themeStore'
import { supabase } from '@/lib/supabase/client'
import { useInstallPrompt } from '@/pwa/useInstallPrompt'
import { useEntitlement } from '@/features/entitlements/hooks'
import { useCurrentWallet } from '@/features/wallets/hooks'
import { CategoryManager } from '@/features/categories/CategoryManager'
import { useProfile, useUpdateProfile } from './hooks'
import { PERSONALITIES, type AiPersonality } from './types'
import { PROFILE_MODES, type ProfileMode } from './modes'

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

export function SettingsPage() {
  const session = useAuthStore((s) => s.session)
  const userId = session?.user.id
  const { data: profile } = useProfile(userId)
  const updateProfile = useUpdateProfile(userId)
  const install = useInstallPrompt()
  const { isPremium } = useEntitlement(userId)
  const { data: wallet } = useCurrentWallet()
  const themeMode = useThemeStore((s) => s.mode)
  const setThemeMode = useThemeStore((s) => s.setMode)

  const [displayName, setDisplayName] = useState('')
  const [personality, setPersonality] = useState<AiPersonality>('balanced_coach')
  const [mode, setMode] = useState<ProfileMode>('individual')

  useEffect(() => {
    if (!profile) return
    setDisplayName(profile.display_name ?? '')
    setPersonality(profile.ai_personality)
    setMode(profile.mode)
  }, [profile])

  if (!session) return <Navigate to="/login" replace />

  async function handleSave() {
    try {
      await updateProfile.mutateAsync({
        display_name: displayName.trim() || null,
        ai_personality: personality,
        mode,
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
      mode !== profile.mode)

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-4 p-4 pb-24">
      <header>
        <h1 className="text-xl font-semibold">Settings</h1>
      </header>

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
            {isPremium && <Sparkles className="size-3" />}
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
                  className={
                    'flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center ' +
                    (active ? 'border-primary bg-accent' : 'border-border')
                  }
                >
                  <m.icon className={'size-5 ' + (active ? 'text-primary' : 'text-muted-foreground')} />
                  <span className="text-xs font-medium">{m.label}</span>
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
                <Icon className="size-4" />
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
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
                    <span
                      className="grid size-11 shrink-0 place-items-center rounded-full"
                      style={{
                        background: `radial-gradient(circle at 35% 30%, ${p.accent}, color-mix(in srgb, ${p.accent} 45%, var(--iris)))`,
                      }}
                    >
                      <p.icon className="size-5 text-white" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{p.label}</p>
                      <p className="text-xs text-muted-foreground">{p.description}</p>
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

      {dirty && (
        <Button onClick={handleSave} disabled={updateProfile.isPending}>
          Save changes
        </Button>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Install Penda</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {install.installed ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Smartphone className="size-4" /> Installed — you're using the app.
            </p>
          ) : install.canPrompt ? (
            <Button variant="outline" onClick={install.promptInstall}>
              <Download className="size-4" />
              Add to home screen
            </Button>
          ) : install.showIosInstructions ? (
            <div className="flex flex-col gap-1 text-sm text-muted-foreground">
              <p className="flex items-center gap-1.5">
                1. Tap <Share className="inline size-4" /> Share in Safari
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

      <Button variant="outline" onClick={() => supabase.auth.signOut()}>
        Sign out
      </Button>

      <BottomNav />
    </main>
  )
}
