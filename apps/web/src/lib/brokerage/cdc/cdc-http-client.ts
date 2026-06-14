/**
 * Crypto.com Exchange v1 HTTP client — browser-compatible, using
 * Web Crypto for HMAC-SHA256 request signing.
 *
 * Public endpoints (`public/*`) are unsigned GETs with query params.
 * Private endpoints are signed POSTs with the JSON envelope
 * `{id, method, api_key, params, nonce, sig}` where
 * `sig = hex(HMAC-SHA256(method + id + api_key + paramsString + nonce, secret))`
 * and `paramsString` concatenates params sorted by key ascending as
 * `key + value`, applied recursively to nested objects/arrays.
 */

import type { CdcApiRequest, CdcApiResponse, CdcClientConfig } from './cdc-types'

const DEFAULT_SERVER_URL = 'https://api.crypto.com/exchange/v1'

/**
 * Exchange error codes that indicate bad credentials / missing permission:
 * 40101 not authenticated / bad signature, 40102 invalid nonce,
 * 40103 IP not whitelisted, 40104 user tier invalid; plus HTTP 401/403.
 */
const AUTH_ERROR_CODES = new Set([40101, 40102, 40103, 40104, 401, 403])
/** Exchange error code for request throttling */
const RATE_LIMIT_CODES = new Set([42901, 429])

export class CdcHttpError extends Error {
  code: number
  constructor(code: number, message: string) {
    super(`Crypto.com API error ${code}: ${message}`)
    this.code = code
    this.name = 'CdcHttpError'
  }
}

/** Credential or permission failure — not retryable, user must fix the API key */
export class CdcAuthError extends Error {
  code: number
  constructor(code: number, message: string) {
    super(`Crypto.com authentication error ${code}: ${message}`)
    this.code = code
    this.name = 'CdcAuthError'
  }
}

/** Throttled — transient, retryable after backoff */
export class CdcRateLimitError extends Error {
  code: number
  constructor(code: number, message: string) {
    super(`Crypto.com rate limit ${code}: ${message}`)
    this.code = code
    this.name = 'CdcRateLimitError'
  }
}

function throwForCode(code: number, message: string): never {
  if (AUTH_ERROR_CODES.has(code)) throw new CdcAuthError(code, message)
  if (RATE_LIMIT_CODES.has(code)) throw new CdcRateLimitError(code, message)
  throw new CdcHttpError(code, message)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Canonicalize a value per the exchange signing spec:
 * objects → keys sorted ascending, each contributing `key + canon(value)`;
 * arrays → concatenation of each element's canonical form;
 * null/undefined → empty string; primitives → string form.
 */
export function paramsToString(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) {
    return value
      .map((item) => (isPlainObject(item) || Array.isArray(item) ? paramsToString(item) : String(item)))
      .join('')
  }
  if (isPlainObject(value)) {
    return Object.keys(value)
      .sort()
      .map((key) => key + paramsToString(value[key]))
      .join('')
  }
  return String(value)
}

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Resolved CryptoKey instance type — works in both DOM and @types/node contexts */
type _Key = Awaited<ReturnType<typeof crypto.subtle.importKey>>

export class CdcHttpClient {
  private config: CdcClientConfig
  private hmacKey: _Key | null = null
  private requestId = 0

  constructor(config: CdcClientConfig) {
    this.config = {
      serverUrl: DEFAULT_SERVER_URL,
      ...config,
    }
  }

  private async getHmacKey(): Promise<_Key> {
    if (this.hmacKey) return this.hmacKey
    this.hmacKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(this.config.apiSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    return this.hmacKey
  }

  /** Compute the request signature for the given envelope fields */
  async sign(method: string, id: number, nonce: number, params: unknown): Promise<string> {
    const payload = `${method}${id}${this.config.apiKey}${paramsToString(params)}${nonce}`
    const key = await this.getHmacKey()
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
    return hex(sig)
  }

  /**
   * Execute an API request. Routes `public/*` methods to unsigned GETs and
   * everything else to signed POSTs. Returns the parsed `result` payload.
   */
  async execute<T>(request: CdcApiRequest): Promise<T> {
    return request.method.startsWith('public/') ? this.executePublic<T>(request) : this.executePrivate<T>(request)
  }

  private async executePublic<T>(request: CdcApiRequest): Promise<T> {
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(request.params ?? {})) {
      if (value !== undefined && value !== null) query.set(key, String(value))
    }
    const qs = query.toString()
    const url = `${this.config.serverUrl}/${request.method}${qs ? `?${qs}` : ''}`

    const response = await fetch(url)
    return this.parseResponse<T>(response)
  }

  private async executePrivate<T>(request: CdcApiRequest): Promise<T> {
    const id = ++this.requestId
    const nonce = Date.now()
    const params = request.params ?? {}
    const sig = await this.sign(request.method, id, nonce, params)

    const response = await fetch(`${this.config.serverUrl}/${request.method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        method: request.method,
        api_key: this.config.apiKey,
        params,
        nonce,
        sig,
      }),
    })
    return this.parseResponse<T>(response)
  }

  private async parseResponse<T>(response: Response): Promise<T> {
    let json: CdcApiResponse<T> | undefined
    try {
      json = (await response.json()) as CdcApiResponse<T>
    } catch {
      // Non-JSON body — fall through to HTTP status handling
    }

    if (json && json.code !== undefined && json.code !== 0) {
      throwForCode(json.code, json.message ?? 'Unknown error')
    }
    if (!response.ok) {
      throwForCode(response.status, response.statusText || `HTTP ${response.status}`)
    }
    if (!json) {
      throw new CdcHttpError(0, 'Empty or non-JSON response body')
    }
    return json.result as T
  }
}
