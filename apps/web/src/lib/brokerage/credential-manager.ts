/**
 * Encrypted credential manager for brokerage API keys.
 *
 * Uses Web Crypto API (AES-256-GCM) for encryption and PBKDF2 for key
 * derivation. Credentials are stored encrypted in Dexie's
 * `brokerage_credentials` table — plaintext never touches persistent storage.
 *
 * Flow:
 *   1. User provides credentials (e.g. tigerId + privateKey) + passphrase
 *   2. PBKDF2 derives an AES key from the passphrase + random salt
 *   3. Credentials JSON is encrypted with AES-GCM (random IV)
 *   4. Encrypted blob + salt + IV are stored in Dexie
 *
 * On sync:
 *   1. App prompts for passphrase
 *   2. PBKDF2 re-derives the AES key
 *   3. Encrypted blob is decrypted
 *   4. Plaintext credentials are passed to the provider (in-memory only)
 */

import type { BrokerageCredentials, BrokerageSource } from '@lokfi/brokerage-core'

const ALGORITHM = 'AES-GCM'
const KEY_LENGTH = 256
const PBKDF2_ITERATIONS = 600_000
const PBKDF2_HASH = 'SHA-256'

export class CredentialDecryptError extends Error {
  constructor() {
    super('Wrong passphrase or corrupted credentials')
    this.name = 'CredentialDecryptError'
  }
}

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
   * Encrypt credentials and persist to the store.
   *
   * @param source - Brokerage identifier (e.g. 'tiger')
   * @param credentials - Plaintext credentials object
   * @param passphrase - User-supplied passphrase for key derivation
   */
  async store(source: BrokerageSource, credentials: Record<string, string>, passphrase: string): Promise<void> {
    const salt = crypto.getRandomValues(new Uint8Array(32))
    const key = await deriveKey(passphrase, salt)

    const iv = crypto.getRandomValues(new Uint8Array(12))
    const plaintext = new TextEncoder().encode(JSON.stringify(credentials))
    const ciphertext = await crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, plaintext)

    const record: BrokerageCredentials = {
      id: source,
      encryptedData: arrayBufferToBase64(ciphertext),
      iv: arrayBufferToBase64(iv.buffer),
      salt: arrayBufferToBase64(salt.buffer),
    }

    await this.credStore.put(record)
  }

  /**
   * Retrieve and decrypt credentials.
   *
   * @param source - Brokerage identifier
   * @param passphrase - User-supplied passphrase
   * @returns Plaintext credentials, or null if not found or decryption fails
   */
  async retrieve(source: BrokerageSource, passphrase: string): Promise<Record<string, string> | null> {
    const record = await this.credStore.get(source)
    if (!record) return null

    try {
      const salt = base64ToArrayBuffer(record.salt)
      const key = await deriveKey(passphrase, new Uint8Array(salt))

      const iv = new Uint8Array(base64ToArrayBuffer(record.iv))
      const ciphertext = base64ToArrayBuffer(record.encryptedData)

      const plaintext = await crypto.subtle.decrypt({ name: ALGORITHM, iv }, key, ciphertext)
      const json = new TextDecoder().decode(plaintext)
      return JSON.parse(json) as Record<string, string>
    } catch {
      // Decryption failure — wrong passphrase or corrupted data
      throw new CredentialDecryptError()
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

async function deriveKey(passphrase: string, salt: BufferSource): Promise<CryptoKey> {
  const material = new TextEncoder().encode(passphrase)
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
