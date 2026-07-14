import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Check, Download, Share, Smartphone, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BottomNav } from '@/components/BottomNav'
import { useAuthStore } from '@/store/authStore'
import { supabase } from '@/lib/supabase/client'
import { useInstallPrompt } from '@/pwa/useInstallPrompt'
import { useEntitlement } from '@/features/entitlements/hooks'
import { useProfile, useUpdateProfile } from './hooks'
import { PERSONALITIES, type AiPersonality } from './types'

export function SettingsPage() {
  const session = useAuthStore((s) => s.session)
  const userId = session?.user.id
  const { data: profile } = useProfile(userId)
  const updateProfile = useUpdateProfile(userId)
  const install = useInstallPrompt()
  const { isPremium } = useEntitlement(userId)

  const [displayName, setDisplayName] = useState('')
  const [personality, setPersonality] = useState<AiPersonality>('balanced_coach')

  useEffect(() => {
    if (!profile) return
    setDisplayName(profile.display_name ?? '')
    setPersonality(profile.ai_personality)
  }, [profile])

  if (!session) return <Navigate to="/login" replace />

  async function handleSave() {
    try {
      await updateProfile.mutateAsync({
        display_name: displayName.trim() || null,
        ai_personality: personality,
      })
      toast('Settings saved.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  const dirty =
    !!profile &&
    (displayName !== (profile.display_name ?? '') || personality !== profile.ai_personality)

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
              Premium unlocks voice entry, receipt scanning, weekly AI insights, and unlimited
              shared wallet members. Not available to purchase yet — check back soon.
            </p>
          </CardContent>
        )}
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
          <CardTitle className="text-base">Penda's personality</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col overflow-hidden rounded-lg border">
            {PERSONALITIES.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPersonality(p.value)}
                className="flex items-center justify-between gap-3 border-b p-3 text-left last:border-b-0 hover:bg-accent"
                aria-pressed={personality === p.value}
              >
                <div>
                  <p className="text-sm font-medium">{p.label}</p>
                  <p className="text-xs text-muted-foreground">{p.description}</p>
                </div>
                {personality === p.value && <Check className="size-4 shrink-0 text-primary" />}
              </button>
            ))}
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
