import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
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
  if (!evidence) return null
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" size="half" className="gap-3">
        <SheetHeader>
          <SheetTitle>Why this nudge?</SheetTitle>
        </SheetHeader>
        <p className="text-sm text-muted-foreground">{evidence.summary}</p>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm">
          {evidence.bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  )
}
