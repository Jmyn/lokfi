/**
 * Encrypted credential manager for brokerage API keys.
 *
 * Uses Web Crypto API (AES-256-GCM) for encryption and PBKDF2 for key
 * derivation. The key is derived from an application-level secret + random
 * salt. Credentials are stored encrypted in
 * Dexie's `brokerage_credentials` table — plaintext never touches persistent
 * storage.
 *
 * ── Security model ─────────────────────────────────────────────────────
 * This provides protection against casual inspection of IndexedDB (someone
 * opening DevTools sees ciphertext, not plaintext API keys). It does NOT
 * protect against an attacker with access to the browser's runtime (XSS,
 * malicious extensions, devtools execution), since the app secret is in the
 * shipped JavaScript bundle. For stronger security, credentials should never
 * leave a server-side proxy with its own secret.
 *
 * ── Migration ──────────────────────────────────────────────────────────
 * The passphrase-based scheme was removed in favor of automated sync.
 * Legacy credentials (version `undefined` or `'pbkdf2-passphrase'`) must
 * be re-saved from Brokerage Settings to migrate to the `'app-key'` scheme.
 */

import type { BrokerageCredentials, BrokerageSource } from '@lokfi/brokerage-core'

const ALGORITHM = 'AES-GCM'
const KEY_LENGTH = 256
const PBKDF2_ITERATIONS = 600_000
const PBKDF2_HASH = 'SHA-256'

/**
 * App-level secret used as key material for PBKDF2 key derivation.
 *
 * This is embedded in the shipped JavaScript bundle, so it provides
 * protection against casual inspection of IndexedDB — NOT against an
 * attacker with access to the browser runtime (XSS, extensions, etc.).
 * See the class JSDoc above for the full security model discussion.
 * Do NOT use this secret for anything outside this module.
 */
const APP_SECRET = 'lokfi-brokerage-encryption-v1'

export interface CredentialStore {
  get(source: BrokerageSource): Promise<BrokerageCredentials | undefined>
  put(record: BrokerageCredentials): Promise<void>
  delete(source: BrokerageSource): Promise<void>
}

export class CredentialManager {
  private credStore: CredentialStore

  constructor(store: CredentialStore) {
    this.credStore = store
  }

  /**
   * Encrypt credentials and persist to the store using an app-level key.
   * No user passphrase is required — the key is derived from a fixed
   * app secret + random salt.
   *
   * @param source - Brokerage identifier (e.g. 'tiger')
   * @param credentials - Plaintext credentials object
   */
  async store(source: BrokerageSource, credentials: Record<string, string>): Promise<void> {
    const salt = crypto.getRandomValues(new Uint8Array(32))
    const key = await deriveKey(APP_SECRET, salt)

    const iv = crypto.getRandomValues(new Uint8Array(12))
    const plaintext = new TextEncoder().encode(JSON.stringify(credentials))
    const ciphertext = await crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, plaintext)

    const record: BrokerageCredentials = {
      id: source,
      encryptedData: arrayBufferToBase64(ciphertext),
      iv: arrayBufferToBase64(iv.buffer),
      salt: arrayBufferToBase64(salt.buffer),
      version: 'app-key',
    }

    await this.credStore.put(record)
  }

  /**
   * Retrieve and decrypt credentials using the app-level key.
   *
   * Legacy credentials (version `undefined` or `'pbkdf2-passphrase'`) cannot
   * be decrypted without the original user passphrase and return null.
   * The user must re-save credentials via Brokerage Settings to migrate.
   *
   * @param source - Brokerage identifier
   * @returns Plaintext credentials, or null if not found or legacy format
   */
  async retrieve(source: BrokerageSource): Promise<Record<string, string> | null> {
    const record = await this.credStore.get(source)
    if (!record) return null

    // Legacy credentials (passphrase-based) can't be decrypted
    if (!record.version || record.version !== 'app-key') {
      console.warn(
        '[CredentialManager] Legacy passphrase-encrypted credentials detected. Please re-save from Brokerage Settings.'
      )
      return null
    }

    try {
      const salt = base64ToArrayBuffer(record.salt)
      const key = await deriveKey(APP_SECRET, new Uint8Array(salt))

      const iv = new Uint8Array(base64ToArrayBuffer(record.iv))
      const ciphertext = base64ToArrayBuffer(record.encryptedData)

      const plaintext = await crypto.subtle.decrypt({ name: ALGORITHM, iv }, key, ciphertext)
      const json = new TextDecoder().decode(plaintext)
      return JSON.parse(json) as Record<string, string>
    } catch {
      console.error('[CredentialManager] Decryption failed — data may be corrupted')
      return null
    }
  }

  /**
   * Check if credentials exist for a given brokerage.
   */
  async hasCredentials(source: BrokerageSource): Promise<boolean> {
    const record = await this.credStore.get(source)
    return record !== undefined
  }

  /**
   * Remove stored credentials.
   */
  async remove(source: BrokerageSource): Promise<void> {
    await this.credStore.delete(source)
  }
}

// ── Crypto Helpers ────────────────────────────────────────────────────────

async function deriveKey(secret: string, salt: BufferSource): Promise<CryptoKey> {
  const material = new TextEncoder().encode(secret)
  const baseKey = await crypto.subtle.importKey('raw', material, 'PBKDF2', false, ['deriveKey'])

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: PBKDF2_HASH,
    },
    baseKey,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  )
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary)
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}
