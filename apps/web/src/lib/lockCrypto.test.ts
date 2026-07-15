import { describe, expect, it } from 'vitest'
import { generateSalt, hashPin, verifyPin } from './lockCrypto'

describe('lockCrypto', () => {
  it('verifies the correct PIN and rejects a wrong one', async () => {
    const salt = generateSalt()
    const hash = await hashPin('1234', salt)
    expect(await verifyPin('1234', salt, hash)).toBe(true)
    expect(await verifyPin('4321', salt, hash)).toBe(false)
  })

  it('is deterministic for the same PIN + salt', async () => {
    const salt = generateSalt()
    expect(await hashPin('987654', salt)).toBe(await hashPin('987654', salt))
  })

  it('produces different hashes for the same PIN under different salts', async () => {
    const a = await hashPin('1234', generateSalt())
    const b = await hashPin('1234', generateSalt())
    expect(a).not.toBe(b)
  })

  it('generates 16-byte (24-char base64) salts', () => {
    expect(generateSalt()).toHaveLength(24)
  })
})
