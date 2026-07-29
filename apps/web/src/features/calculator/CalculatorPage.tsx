import { useEffect, useReducer } from 'react'
import { Navigate } from 'react-router-dom'
import { Backspace } from '@/components/icons/product'
import { PageHeader } from '@/components/PageHeader'
import { BottomNav } from '@/components/BottomNav'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/lib/utils'
import {
  INITIAL_STATE,
  backspace,
  chooseOperator,
  clearAll,
  evaluate,
  formatDisplay,
  inputDecimal,
  inputDigit,
  inputPercent,
  toggleSign,
  type CalculatorState,
  type Operator,
} from './calculatorEngine'

type Action =
  | { type: 'digit'; digit: string }
  | { type: 'decimal' }
  | { type: 'operator'; operator: Operator }
  | { type: 'equals' }
  | { type: 'percent' }
  | { type: 'toggleSign' }
  | { type: 'clear' }
  | { type: 'backspace' }

function reducer(state: CalculatorState, action: Action): CalculatorState {
  switch (action.type) {
    case 'digit':
      return inputDigit(state, action.digit)
    case 'decimal':
      return inputDecimal(state)
    case 'operator':
      return chooseOperator(state, action.operator)
    case 'equals':
      return evaluate(state)
    case 'percent':
      return inputPercent(state)
    case 'toggleSign':
      return toggleSign(state)
    case 'clear':
      return clearAll()
    case 'backspace':
      return backspace(state)
  }
}

const OPERATOR_KEYS: Record<string, Operator> = {
  '+': '+',
  '-': '−',
  '*': '×',
  x: '×',
  '/': '÷',
}

function Key({
  onClick,
  tone = 'digit',
  active = false,
  className,
  children,
  label,
}: {
  onClick: () => void
  tone?: 'digit' | 'function' | 'operator' | 'equals'
  active?: boolean
  className?: string
  children: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        'flex items-center justify-center rounded-3xl text-xl font-semibold transition-transform active:scale-95',
        tone === 'digit' && 'bg-card text-foreground ring-1 ring-border/60 shadow-[var(--shadow-soft)]',
        tone === 'function' && 'bg-muted text-foreground',
        tone === 'operator' &&
          (active ? 'bg-[var(--iris)] text-white' : 'bg-[var(--iris-soft)] text-[var(--iris)]'),
        tone === 'equals' && 'bg-[var(--iris)] text-white shadow-[var(--shadow-soft)]',
        className,
      )}
    >
      {children}
    </button>
  )
}

/** Quick four-function calculator, reachable from the top-left menu. */
export function CalculatorPage() {
  const session = useAuthStore((s) => s.session)
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (/^[0-9]$/.test(e.key)) {
        dispatch({ type: 'digit', digit: e.key })
      } else if (e.key === '.') {
        dispatch({ type: 'decimal' })
      } else if (e.key in OPERATOR_KEYS) {
        dispatch({ type: 'operator', operator: OPERATOR_KEYS[e.key] })
      } else if (e.key === 'Enter' || e.key === '=') {
        e.preventDefault()
        dispatch({ type: 'equals' })
      } else if (e.key === 'Escape') {
        dispatch({ type: 'clear' })
      } else if (e.key === 'Backspace') {
        dispatch({ type: 'backspace' })
      } else if (e.key === '%') {
        dispatch({ type: 'percent' })
      } else {
        return
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  if (!session) return <Navigate to="/login" replace />

  const pendingLine =
    state.previousValue !== null ? `${formatDisplay(state.previousValue.toString())} ${state.operator}` : ''

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-5 bg-background px-4 pb-24 pt-[max(1rem,env(safe-area-inset-top))]">
      <PageHeader title="Calculator" subtitle="Quick math, no app-switching" />

      <div className="rounded-[1.5rem] bg-card px-5 pt-5 pb-7 shadow-[var(--shadow-soft)] ring-1 ring-border/50">
        <div className="flex h-5 items-center justify-between">
          <span className="text-sm font-medium tabular-nums text-muted-foreground">{pendingLine}</span>
          <button
            type="button"
            onClick={() => dispatch({ type: 'backspace' })}
            aria-label="Backspace"
            className="grid size-8 place-items-center rounded-full text-muted-foreground transition-transform active:scale-90"
          >
            <Backspace className="size-4" weight="regular" />
          </button>
        </div>
        <p className="mt-2 overflow-x-auto text-right text-5xl font-semibold tabular-nums whitespace-nowrap text-foreground">
          {formatDisplay(state.display)}
        </p>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <Key tone="function" label="All clear" onClick={() => dispatch({ type: 'clear' })}>
          AC
        </Key>
        <Key tone="function" label="Toggle sign" onClick={() => dispatch({ type: 'toggleSign' })}>
          ±
        </Key>
        <Key tone="function" label="Percent" onClick={() => dispatch({ type: 'percent' })}>
          %
        </Key>
        <Key
          tone="operator"
          label="Divide"
          active={state.operator === '÷' && state.overwrite}
          onClick={() => dispatch({ type: 'operator', operator: '÷' })}
        >
          ÷
        </Key>

        {(['7', '8', '9'] as const).map((d) => (
          <Key key={d} label={d} className="aspect-square" onClick={() => dispatch({ type: 'digit', digit: d })}>
            {d}
          </Key>
        ))}
        <Key
          tone="operator"
          label="Multiply"
          active={state.operator === '×' && state.overwrite}
          onClick={() => dispatch({ type: 'operator', operator: '×' })}
        >
          ×
        </Key>

        {(['4', '5', '6'] as const).map((d) => (
          <Key key={d} label={d} className="aspect-square" onClick={() => dispatch({ type: 'digit', digit: d })}>
            {d}
          </Key>
        ))}
        <Key
          tone="operator"
          label="Subtract"
          active={state.operator === '−' && state.overwrite}
          onClick={() => dispatch({ type: 'operator', operator: '−' })}
        >
          −
        </Key>

        {(['1', '2', '3'] as const).map((d) => (
          <Key key={d} label={d} className="aspect-square" onClick={() => dispatch({ type: 'digit', digit: d })}>
            {d}
          </Key>
        ))}
        <Key
          tone="operator"
          label="Add"
          active={state.operator === '+' && state.overwrite}
          onClick={() => dispatch({ type: 'operator', operator: '+' })}
        >
          +
        </Key>

        <Key label="0" className="col-span-2" onClick={() => dispatch({ type: 'digit', digit: '0' })}>
          0
        </Key>
        <Key label="Decimal point" className="aspect-square" onClick={() => dispatch({ type: 'decimal' })}>
          .
        </Key>
        <Key tone="equals" label="Equals" className="aspect-square" onClick={() => dispatch({ type: 'equals' })}>
          =
        </Key>
      </div>

      <BottomNav />
    </main>
  )
}
