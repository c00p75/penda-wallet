import { useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { AiInsight } from '@/components/AiInsight'
import { Button } from '@/components/ui/button'
import type { CoachingInsight } from './detectCoachingInsights'

/**
 * Renders the single most useful proactive insight with its one-tap action —
 * Penda catching something good or worth doing, without being asked.
 */
export function CoachingCard({ insight }: { insight: CoachingInsight }) {
  const navigate = useNavigate()

  function handleAction() {
    switch (insight.action?.kind) {
      case 'create-budget':
      case 'view-budgets':
        navigate('/budgets')
        break
      case 'fund-goal':
      case 'view-goals':
        navigate('/goals')
        break
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <AiInsight tone={insight.tone}>{insight.text}</AiInsight>
      {insight.action && (
        <Button variant="ghost" size="sm" onClick={handleAction} className="self-end text-primary">
          {insight.action.label}
          <ArrowRight className="size-4" />
        </Button>
      )}
    </div>
  )
}
