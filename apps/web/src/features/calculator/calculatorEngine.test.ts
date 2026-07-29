import { describe, expect, it } from 'vitest'
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
} from './calculatorEngine'

function type(state: CalculatorState, keys: string): CalculatorState {
  for (const key of keys) state = inputDigit(state, key)
  return state
}

describe('inputDigit', () => {
  it('replaces the leading zero', () => {
    expect(type(INITIAL_STATE, '5').display).toBe('5')
  })

  it('appends subsequent digits', () => {
    expect(type(INITIAL_STATE, '123').display).toBe('123')
  })

  it('starts fresh after overwrite (e.g. right after an operator)', () => {
    const afterPlus = chooseOperator(type(INITIAL_STATE, '5'), '+')
    expect(inputDigit(afterPlus, '3').display).toBe('3')
  })

  it('caps at the max digit count', () => {
    const twelveDigits = type(INITIAL_STATE, '123456789012')
    expect(inputDigit(twelveDigits, '3').display).toBe('123456789012')
  })
})

describe('inputDecimal', () => {
  it('adds a trailing decimal point once', () => {
    const state = inputDecimal(type(INITIAL_STATE, '12'))
    expect(state.display).toBe('12.')
    expect(inputDecimal(state).display).toBe('12.') // no second decimal point
  })

  it('starts a fresh "0." after overwrite', () => {
    expect(inputDecimal(INITIAL_STATE).display).toBe('0.')
  })
})

describe('toggleSign', () => {
  it('flips between negative and positive', () => {
    const five = type(INITIAL_STATE, '5')
    expect(toggleSign(five).display).toBe('-5')
    expect(toggleSign(toggleSign(five)).display).toBe('5')
  })

  it('is a no-op on zero', () => {
    expect(toggleSign(INITIAL_STATE).display).toBe('0')
  })
})

describe('inputPercent', () => {
  it('divides the current value by 100', () => {
    expect(inputPercent(type(INITIAL_STATE, '50')).display).toBe('0.5')
  })
})

describe('chooseOperator + evaluate', () => {
  it('computes a simple sum', () => {
    let state = type(INITIAL_STATE, '2')
    state = chooseOperator(state, '+')
    state = type(state, '3')
    state = evaluate(state)
    expect(state.display).toBe('5')
    expect(state.operator).toBeNull()
  })

  it('chains left to right, like a basic calculator (no operator precedence)', () => {
    let state = type(INITIAL_STATE, '2')
    state = chooseOperator(state, '+')
    state = type(state, '3')
    state = chooseOperator(state, '×') // computes 2+3=5, then queues ×
    expect(state.display).toBe('5')
    state = type(state, '4')
    state = evaluate(state)
    expect(state.display).toBe('20')
  })

  it('swaps a pending operator instead of computing when none entered yet', () => {
    let state = type(INITIAL_STATE, '2')
    state = chooseOperator(state, '+')
    state = chooseOperator(state, '×')
    expect(state.operator).toBe('×')
    expect(state.previousValue).toBe(2)
  })

  it('divide by zero yields Error', () => {
    let state = type(INITIAL_STATE, '5')
    state = chooseOperator(state, '÷')
    state = type(state, '0')
    state = evaluate(state)
    expect(state.display).toBe('Error')
  })

  it('evaluate is a no-op with no pending operator', () => {
    const five = type(INITIAL_STATE, '5')
    expect(evaluate(five)).toEqual(five)
  })
})

describe('backspace', () => {
  it('removes the last character', () => {
    expect(backspace(type(INITIAL_STATE, '123')).display).toBe('12')
  })

  it('resets to 0 once the last digit is removed', () => {
    expect(backspace(type(INITIAL_STATE, '5')).display).toBe('0')
  })

  it('is a no-op right after an operator (overwrite state)', () => {
    const afterPlus = chooseOperator(type(INITIAL_STATE, '5'), '+')
    expect(backspace(afterPlus)).toEqual(afterPlus)
  })
})

describe('clearAll', () => {
  it('resets to the initial state', () => {
    let state = type(INITIAL_STATE, '99')
    state = chooseOperator(state, '+')
    expect(clearAll()).toEqual(INITIAL_STATE)
  })
})

describe('formatDisplay', () => {
  it('adds thousands separators', () => {
    expect(formatDisplay('1234567')).toBe('1,234,567')
  })

  it('preserves an in-progress decimal typed by the user', () => {
    expect(formatDisplay('1234.')).toBe('1,234.')
    expect(formatDisplay('1234.50')).toBe('1,234.50')
  })

  it('preserves the negative sign', () => {
    expect(formatDisplay('-1234')).toBe('-1,234')
  })

  it('passes Error through unchanged', () => {
    expect(formatDisplay('Error')).toBe('Error')
  })
})
