import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { Insight } from './types'

interface InsightsListProps {
  insights: Insight[]
  onDismiss: (id: string) => void
  /** Insight to scroll to and highlight, e.g. from a recap notification deep link. */
  highlightId?: string | null
}

export function InsightsList({ insights, onDismiss, highlightId }: InsightsListProps) {
  const highlightRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (highlightId) highlightRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [highlightId])

  if (insights.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        No insights yet, check back after your first week of tracked spending.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {insights.map((insight) => (
        <Card
          key={insight.id}
          ref={insight.id === highlightId ? highlightRef : undefined}
          className={cn(insight.id === highlightId && 'ring-2 ring-[var(--iris)] ring-offset-2 ring-offset-background')}
        >
          <CardContent className="flex items-start justify-between gap-2 py-3">
            <p className="text-sm">{insight.content.text}</p>
            <Button
              variant="ghost"
              size="icon"
              className="size-6 shrink-0"
              onClick={() => onDismiss(insight.id)}
              aria-label="Dismiss insight"
            >
              <X className="size-3.5" />
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
