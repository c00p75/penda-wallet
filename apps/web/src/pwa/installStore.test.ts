import { beforeEach, describe, expect, it, vi } from 'vitest'

// The store keeps module-level state, so re-import a fresh copy per test.
async function freshStore() {
  vi.resetModules()
  localStorage.clear()
  return import('./installStore')
}

function fireBeforeInstallPrompt(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt') as Event & {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
  }
  event.prompt = vi.fn().mockResolvedValue(undefined)
  event.userChoice = Promise.resolve({ outcome })
  window.dispatchEvent(event)
  return event
}

describe('installStore', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('captures a beforeinstallprompt fired after init — even with no component mounted', async () => {
    const store = await freshStore()
    store.initInstallCapture()
    expect(store.getInstallSnapshot().canPrompt).toBe(false)

    fireBeforeInstallPrompt()

    expect(store.getInstallSnapshot().canPrompt).toBe(true)
  })

  it('notifies subscribers when the event arrives', async () => {
    const store = await freshStore()
    store.initInstallCapture()
    const listener = vi.fn()
    store.subscribeInstall(listener)

    fireBeforeInstallPrompt()

    expect(listener).toHaveBeenCalled()
  })

  it('clears the prompt once the user accepts the native dialog', async () => {
    const store = await freshStore()
    store.initInstallCapture()
    const event = fireBeforeInstallPrompt('accepted')

    await store.promptInstall()

    expect(event.prompt).toHaveBeenCalledOnce()
    expect(store.getInstallSnapshot().canPrompt).toBe(false)
  })

  it('marks installed and drops the prompt on appinstalled', async () => {
    const store = await freshStore()
    store.initInstallCapture()
    fireBeforeInstallPrompt()

    window.dispatchEvent(new Event('appinstalled'))

    const snap = store.getInstallSnapshot()
    expect(snap.installed).toBe(true)
    expect(snap.canPrompt).toBe(false)
  })

  it('persists dismissal to localStorage', async () => {
    const store = await freshStore()
    store.initInstallCapture()

    store.dismissInstall()

    expect(store.getInstallSnapshot().dismissed).toBe(true)
    expect(localStorage.getItem('penda:install-dismissed')).toBe('1')
  })

  it('starts dismissed when the persisted flag is already set', async () => {
    vi.resetModules()
    localStorage.clear()
    localStorage.setItem('penda:install-dismissed', '1')
    const store = await import('./installStore')
    expect(store.getInstallSnapshot().dismissed).toBe(true)
  })

  it('is idempotent — repeated init does not double-register', async () => {
    const store = await freshStore()
    store.initInstallCapture()
    store.initInstallCapture()
    const listener = vi.fn()
    store.subscribeInstall(listener)

    fireBeforeInstallPrompt()

    // One event → one notification, not two.
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
