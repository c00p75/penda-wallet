import { b64ToBytes, bufToB64 } from '@/lib/lockCrypto'

// Biometric unlock via WebAuthn's platform authenticator (Face ID / fingerprint).
// This is a *local* gate, not server authentication: we register a platform
// credential when the user enables the lock, then a successful get() ceremony
// with userVerification 'required' is our proof the device owner is present.
// There's no relying-party server verifying the assertion — the ceremony
// succeeding is the signal.

function challenge(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32))
}

export async function isBiometricAvailable(): Promise<boolean> {
  if (typeof window === 'undefined' || !('PublicKeyCredential' in window)) return false
  const pkc = window.PublicKeyCredential as typeof PublicKeyCredential & {
    isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean>
  }
  if (!pkc.isUserVerifyingPlatformAuthenticatorAvailable) return false
  try {
    return await pkc.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

/** Register a platform credential. Returns the base64 credential id to store, or null on failure/decline. */
export async function registerBiometric(userId: string, userName: string): Promise<string | null> {
  try {
    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge: challenge() as BufferSource,
        rp: { name: 'Penda', id: location.hostname },
        user: {
          id: new TextEncoder().encode(userId) as BufferSource,
          name: userName,
          displayName: userName,
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'discouraged',
        },
        timeout: 60_000,
        attestation: 'none',
      },
    })) as PublicKeyCredential | null
    return credential ? bufToB64(credential.rawId) : null
  } catch {
    return null
  }
}

/** Run the biometric ceremony against a stored credential. True = device owner verified. */
export async function verifyBiometric(credentialIdB64: string): Promise<boolean> {
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: challenge() as BufferSource,
        allowCredentials: [{ type: 'public-key', id: b64ToBytes(credentialIdB64) as BufferSource }],
        userVerification: 'required',
        rpId: location.hostname,
        timeout: 60_000,
      },
    })
    return !!assertion
  } catch {
    return false
  }
}
