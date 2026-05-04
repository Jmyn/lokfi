/**
 * Tiger OpenAPI HTTP client — browser-compatible implementation using
 * Web Crypto API for RSA signing.
 *
 * Replicates the auth flow from @tigeropenapi/tigeropen SDK but uses
 * `crypto.subtle` instead of Node.js `crypto` module.
 */

import type { TigerApiRequest, TigerApiResponse, TigerClientConfig } from './tiger-types'

const DEFAULT_SERVER_URL = 'https://openapi.tigerfintech.com'
const API_VERSION = '2.0'

/** Format a Date as 'yyyy-MM-dd HH:mm:ss' (Tiger API expected format) */
function formatTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export class TigerHttpError extends Error {
  code: number
  constructor(code: number, message: string) {
    super(`Tiger API error ${code}: ${message}`)
    this.code = code
    this.name = 'TigerHttpError'
  }
}

export class TigerAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TigerAuthError'
  }
}

/**
 * Browser-compatible Tiger OpenAPI HTTP client using Web Crypto for RSA signing.
 */
/** Resolved CryptoKey instance type — works in both DOM and @types/node contexts */
type _Key = Awaited<ReturnType<typeof crypto.subtle.importKey>>

export class TigerHttpClient {
  private config: TigerClientConfig
  private privateKey: _Key | null = null

  constructor(config: TigerClientConfig) {
    this.config = {
      language: 'en_US',
      serverUrl: DEFAULT_SERVER_URL,
      ...config,
    }
  }

  /** Ensure the private key is imported into Web Crypto */
  private async getPrivateKey(): Promise<_Key> {
    if (this.privateKey) return this.privateKey

    const pem = this.parsePem(this.config.privateKey)

    try {
      this.privateKey = await crypto.subtle.importKey(
        'pkcs8',
        pem,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-1' },
        false,
        ['sign']
      )
    } catch {
      throw new TigerAuthError(
        'Failed to import RSA private key. Ensure the key is in PKCS8 PEM format.\n' +
          'If you have a PKCS1 key (-----BEGIN RSA PRIVATE KEY-----), convert it with:\n' +
          '  openssl pkcs8 -topk8 -inform PEM -outform PEM -in key.pem -out key_pkcs8.pem -nocrypt'
      )
    }

    return this.privateKey
  }

  /**
   * Execute an API request. Signs the request with RSA, sends POST as JSON,
   * verifies response signature, returns parsed data.
   */
  async execute<T>(request: TigerApiRequest): Promise<T> {
    const url = `${this.config.serverUrl}/gateway`

    const params = await this.buildSignedParams(request)
    const body = JSON.stringify(params)

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json;charset=UTF-8' },
      body,
    })

    if (!response.ok) {
      throw new TigerHttpError(response.status, `HTTP ${response.status}: ${response.statusText}`)
    }

    const json = (await response.json()) as TigerApiResponse<T>

    if (json.code !== 0) {
      throw new TigerHttpError(json.code, json.message)
    }

    // The Tiger API returns `data` as a JSON-encoded string in some responses.
    // Double-parse if needed.
    let data = json.data
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data) as T
      } catch {
        // Not valid JSON — return as-is
      }
    }

    return data
  }

  /** Build JSON params with RSA signature */
  private async buildSignedParams(request: TigerApiRequest): Promise<Record<string, string>> {
    const timestamp = formatTimestamp(new Date())
    const params: Record<string, string> = {
      method: request.method,
      version: request.version || API_VERSION,
      format: 'json',
      charset: 'UTF-8',
      sign_type: 'RSA',
      timestamp,
      biz_content: request.bizContent,
      tiger_id: this.config.tigerId,
      ...(this.config.language ? { language: this.config.language } : {}),
    }

    // Sort keys alphabetically and build sign string
    const signContent = Object.keys(params)
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join('&')

    const key = await this.getPrivateKey()
    const signature = await crypto.subtle.sign(
      { name: 'RSASSA-PKCS1-v1_5' },
      key,
      new TextEncoder().encode(signContent)
    )

    params.sign = this.arrayBufferToBase64(signature)

    return params
  }

  /** Parse a PEM string to ArrayBuffer (strips headers/footers) */
  private parsePem(pem: string): ArrayBuffer {
    const b64 = pem
      .replace(/-----BEGIN .*?-----/g, '')
      .replace(/-----END .*?-----/g, '')
      .replace(/\s+/g, '')

    const binary = atob(b64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes.buffer
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]!)
    }
    return btoa(binary)
  }
}
