import { Button } from '@/components/ui/button'
import type { DeferredQuestion } from './deferredQuestions'

export function DeferredQuestionBanner({
  question,
  onAsk,
  onDismiss,
}: {
  question: DeferredQuestion
  onAsk: () => void
  onDismiss: () => void
}) {
  return (
    <div className="mx-5 mb-2 flex items-start gap-2 rounded-xl border bg-muted/40 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">Saved for later</p>
        <p className="text-sm leading-snug">{question.question}</p>
      </div>
      <div className="flex shrink-0 flex-col gap-1">
        <Button size="sm" variant="secondary" className="h-7 px-2 text-xs" onClick={onAsk}>
          Ask now
        </Button>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  )
}
