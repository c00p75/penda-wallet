import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'

// jsdom's localStorage is shared across the whole test file, not reset per
// test — without this, state a component persists (e.g. chat history) leaks
// between unrelated tests that happen to reuse the same storage key.
afterEach(() => {
  localStorage.clear()
})
