export type Operator = '+' | '−' | '×' | '÷'

export interface CalculatorState {
  /** Raw digits being typed/shown, e.g. "12.5" or "-3". Not grouped — see `formatDisplay`. */
  display: string
  previousValue: number | null
  operator: Operator | null
  /** True right after an operator/equals/clear, so the next digit starts a fresh number. */
  overwrite: boolean
}

export const INITIAL_STATE: CalculatorState = {
  display: '0',
  previousValue: null,
  operator: null,
  overwrite: true,
}

const MAX_DIGITS = 12

/** Rounds away float noise (0.1 + 0.2) and falls back to exponential notation past MAX_DIGITS. */
function clampDisplay(n: number): string {
  if (!Number.isFinite(n)) return 'Error'
  const rounded = Math.round(n * 1e9) / 1e9
  const str = rounded.toString()
  if (str.replace(/[-.]/g, '').length > MAX_DIGITS) {
    return rounded.toExponential(6)
  }
  return str
}

function compute(a: number, b: number, operator: Operator): number {
  switch (operator) {
    case '+':
      return a + b
    case '−':
      return a - b
    case '×':
      return a * b
    case '÷':
      return b === 0 ? NaN : a / b
  }
}

export function inputDigit(state: CalculatorState, digit: string): CalculatorState {
  if (state.display === 'Error' || state.overwrite) {
    return { ...state, display: digit === '0' ? '0' : digit, overwrite: false }
  }
  if (state.display === '0') return { ...state, display: digit }
  if (state.display.replace(/[-.]/g, '').length >= MAX_DIGITS) return state
  return { ...state, display: state.display + digit }
}

export function inputDecimal(state: CalculatorState): CalculatorState {
  if (state.display === 'Error' || state.overwrite) return { ...state, display: '0.', overwrite: false }
  if (state.display.includes('.')) return state
  return { ...state, display: state.display + '.' }
}

export function toggleSign(state: CalculatorState): CalculatorState {
  if (state.display === '0' || state.display === 'Error') return state
  return {
    ...state,
    display: state.display.startsWith('-') ? state.display.slice(1) : `-${state.display}`,
  }
}

export function inputPercent(state: CalculatorState): CalculatorState {
  if (state.display === 'Error') return state
  return { ...state, display: clampDisplay(parseFloat(state.display) / 100), overwrite: true }
}

export function clearAll(): CalculatorState {
  return INITIAL_STATE
}

export function backspace(state: CalculatorState): CalculatorState {
  if (state.overwrite || state.display === 'Error') return state
  const next = state.display.slice(0, -1)
  if (next === '' || next === '-') return { ...state, display: '0', overwrite: true }
  return { ...state, display: next }
}

export function chooseOperator(state: CalculatorState, operator: Operator): CalculatorState {
  if (state.display === 'Error') return state
  const current = parseFloat(state.display)

  if (state.previousValue === null) {
    return { ...state, previousValue: current, operator, overwrite: true }
  }
  if (state.overwrite) {
    // Pending operator not yet used — swap it rather than compute against nothing new.
    return { ...state, operator }
  }
  const result = compute(state.previousValue, current, state.operator!)
  return { display: clampDisplay(result), previousValue: result, operator, overwrite: true }
}

export function evaluate(state: CalculatorState): CalculatorState {
  if (state.operator === null || state.previousValue === null || state.display === 'Error') return state
  const current = parseFloat(state.display)
  const result = compute(state.previousValue, current, state.operator)
  return { display: clampDisplay(result), previousValue: null, operator: null, overwrite: true }
}

/** Adds thousands separators for display, preserving in-progress typing (trailing "." or zeros). */
export function formatDisplay(display: string): string {
  if (display === 'Error') return display
  const negative = display.startsWith('-')
  const raw = negative ? display.slice(1) : display
  const [intPart, decPart] = raw.split('.')
  const groupedInt = intPart === '' ? '0' : Number(intPart).toLocaleString()
  const result = decPart !== undefined ? `${groupedInt}.${decPart}` : groupedInt
  return negative ? `-${result}` : result
}
