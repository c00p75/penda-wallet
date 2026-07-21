import { Check, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { PersonaAvatar } from './PersonaAvatar'
import { useProfile, useUpdateProfile } from './hooks'
import {
  DEFAULT_AI_CONSENT,
  DEFAULT_COMPANION_PREFS,
  PERSONALITIES,
  resolveAiPersonality,
  type AiPersonality,
} from './types'

export function AiSettingsSheet({
  open,
  onOpenChange,
  onOpenFullSettings,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenFullSettings?: () => void
}) {
  const session = useAuthStore((s) => s.session)
  const userId = session?.user.id
  const { data: profile } = useProfile(userId)
  const updateProfile = useUpdateProfile(userId)

  const personality = resolveAiPersonality(profile?.ai_personality)
  const unpromptedCoaching =
    profile?.ai_consent?.unprompted_coaching ?? DEFAULT_AI_CONSENT.unprompted_coaching
  const quietEnabled =
    profile?.companion_prefs?.quiet_enabled ?? DEFAULT_COMPANION_PREFS.quiet_enabled

  async function selectPersonality(value: AiPersonality) {
    if (!userId || updateProfile.isPending) return
    // Also rewrite legacy stored values (e.g. gen_z → funny_comedian) when the
    // resolved picker selection matches what the user already sees as active.
    if (profile?.ai_personality === value) return
    try {
      await updateProfile.mutateAsync({ ai_personality: value })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update persona.')
    }
  }

  async function setUnpromptedCoaching(on: boolean) {
    if (!userId || !profile || updateProfile.isPending) return
    const ai_consent = { ...(profile.ai_consent ?? DEFAULT_AI_CONSENT), unprompted_coaching: on }
    try {
      await updateProfile.mutateAsync({ ai_consent })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update setting.')
    }
  }

  async function setQuietEnabled(on: boolean) {
    if (!userId || !profile || updateProfile.isPending) return
    const companion_prefs = {
      ...(profile.companion_prefs ?? DEFAULT_COMPANION_PREFS),
      quiet_enabled: on,
    }
    try {
      await updateProfile.mutateAsync({ companion_prefs })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update setting.')
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="gap-5">
        <SheetHeader>
          <SheetTitle>AI settings</SheetTitle>
          <SheetDescription>
            Who Penda is in chat, and how often they reach out.
          </SheetDescription>
        </SheetHeader>

        <section className="flex flex-col gap-2 px-5">
          <h3 className="text-sm font-medium">Who should Penda be?</h3>
          <div className="flex flex-col gap-2">
            {PERSONALITIES.map((p) => {
              const active = personality === p.value
              return (
                <button
                  key={p.value}
                  type="button"
                  disabled={updateProfile.isPending}
                  onClick={() => selectPersonality(p.value)}
                  className={cn(
                    'flex flex-col gap-2 rounded-2xl border p-3 text-left transition-shadow',
                    active ? 'shadow-md' : 'hover:shadow-sm',
                    updateProfile.isPending && 'opacity-70',
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
                    <PersonaAvatar value={p.value} accent={p.accent} size={40} />
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
          <p className="text-xs text-muted-foreground">
            Changes how Penda talks to you in chat, never what it does with your money.
          </p>
        </section>

        <section className="flex flex-col gap-3 px-5">
          <h3 className="text-sm font-medium">Presence</h3>
          <div className="flex min-h-12 items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Unprompted coaching</p>
              <p className="text-xs text-muted-foreground">Nudges when you are not in chat.</p>
            </div>
            <Switch
              checked={unpromptedCoaching}
              disabled={updateProfile.isPending || !profile}
              onCheckedChange={setUnpromptedCoaching}
              aria-label="Unprompted coaching"
            />
          </div>
          <div className="flex min-h-12 items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Quiet hours</p>
              <p className="text-xs text-muted-foreground">Evening to morning hush.</p>
            </div>
            <Switch
              checked={quietEnabled}
              disabled={updateProfile.isPending || !profile}
              onCheckedChange={setQuietEnabled}
              aria-label="Quiet hours"
            />
          </div>
        </section>

        {onOpenFullSettings && (
          <button
            type="button"
            onClick={() => {
              onOpenChange(false)
              onOpenFullSettings()
            }}
            className="mx-5 mb-2 flex items-center gap-2 rounded-xl px-1 py-2 text-sm font-medium text-primary hover:bg-muted"
          >
            <span className="flex-1 text-left">All AI settings</span>
            <ChevronRight className="size-4" />
          </button>
        )}
      </SheetContent>
    </Sheet>
  )
}
