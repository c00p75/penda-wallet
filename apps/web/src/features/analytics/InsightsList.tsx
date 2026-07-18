import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { Insight } from './types'

interface InsightsListProps {
  insights: Insight[]
  onDismiss: (id: string) => void
}

export function InsightsList({ insights, onDismiss }: InsightsListProps) {
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
        <Card key={insight.id}>
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
