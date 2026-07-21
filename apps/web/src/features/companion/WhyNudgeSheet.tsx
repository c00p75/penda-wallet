import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { BottomSheetHandle, useBottomSheetDrag } from '@/components/ui/bottomSheetDrag'
import { AiMark } from '@/components/AiInsight'
import { SparkleIcon } from '@/components/icons/product'
import { useCloseOnBack } from '@/lib/useCloseOnBack'
import type { NudgeEvidence } from './nudgeEvidence'

export function WhyNudgeSheet({
  open,
  onOpenChange,
  evidence,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  evidence: NudgeEvidence | null
}) {
  useCloseOnBack(open, () => onOpenChange(false))
  const drag = useBottomSheetDrag(() => onOpenChange(false))

  if (!evidence) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        size="half"
        showCloseButton={false}
        className="gap-0 overflow-hidden p-0"
        style={drag.sheetStyle}
      >
        <BottomSheetHandle {...drag.handleProps} />

        <SheetHeader className="px-5 pt-2 pb-0">
          <div className="flex items-center gap-3">
            <AiMark className="size-10" />
            <div className="min-w-0">
              <p className="text-xs font-medium tracking-wide text-muted-foreground">
                From your activity
              </p>
              <SheetTitle className="text-lg">Why this nudge?</SheetTitle>
            </div>
          </div>
        </SheetHeader>

        <div className="flex flex-col gap-4 overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
          <div
            className="rounded-[1.25rem] px-4 py-3.5"
            style={{
              background:
                'linear-gradient(160deg, color-mix(in srgb, var(--iris-soft) 85%, white) 0%, var(--iris-soft) 100%)',
            }}
          >
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-(--iris)">
              <SparkleIcon className="size-3.5" />
              In short
            </div>
            <p className="text-[0.95rem] leading-snug text-foreground">{evidence.summary}</p>
          </div>

          <div className="flex flex-col gap-2">
            <p className="px-0.5 text-xs font-medium tracking-wide text-muted-foreground">
              What we noticed
            </p>
            <ul className="flex flex-col gap-2">
              {evidence.bullets.map((b, i) => (
                <li
                  key={b}
                  className="flex gap-3 rounded-2xl bg-muted/55 px-3.5 py-3 ring-1 ring-border/40"
                >
                  <span
                    aria-hidden
                    className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-[0.7rem] font-semibold tabular-nums"
                    style={{
                      background: 'color-mix(in srgb, var(--mint) 18%, transparent)',
                      color: 'var(--mint-hero-to)',
                    }}
                  >
                    {i + 1}
                  </span>
                  <p className="min-w-0 text-sm leading-snug text-foreground">{b}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
