import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { CdcHttpClient, paramsToString } from './cdc-http-client'

describe('paramsToString', () => {
  it('returns empty string for empty/missing params', () => {
    expect(paramsToString({})).toBe('')
    expect(paramsToString(null)).toBe('')
    expect(paramsToString(undefined)).toBe('')
  })

  it('sorts keys ascending and concatenates key+value', () => {
    expect(paramsToString({ b: '2', a: '1' })).toBe('a1b2')
  })

  it('serializes numbers and booleans as their string form', () => {
    expect(paramsToString({ price: 50000.5, quantity: 1, post_only: true })).toBe('post_onlytrueprice50000.5quantity1')
  })

  it('treats null values as empty string but keeps the key', () => {
    expect(paramsToString({ a: null, b: '2' })).toBe('ab2')
  })

  it('recurses into nested objects with sorted keys', () => {
    expect(paramsToString({ b: '3', a: { y: '2', x: '1' } })).toBe('ax1y2b3')
  })

  it('concatenates array elements in order, recursing into objects', () => {
    expect(paramsToString({ list: [{ b: '2', a: '1' }, { c: '3' }] })).toBe('lista1b2c3')
    expect(paramsToString({ seg_types: ['SEC', 'FUT'] })).toBe('seg_typesSECFUT')
  })

  it('handles the documented order-shaped payload', () => {
    const params = {
      instrument_name: 'BTC_USDT',
      side: 'BUY',
      type: 'LIMIT',
      price: '50000.5',
      quantity: '1',
      exec_inst: ['POST_ONLY'],
    }
    expect(paramsToString(params)).toBe(
      'exec_instPOST_ONLYinstrument_nameBTC_USDTprice50000.5quantity1sideBUYtypeLIMIT'
    )
  })
})

describe('CdcHttpClient.sign', () => {
  it('matches an independent HMAC-SHA256 implementation', async () => {
    const apiKey = 'test-api-key'
    const apiSecret = 'test-api-secret'
    const client = new CdcHttpClient({ apiKey, apiSecret })

    const method = 'private/user-balance'
    const id = 12
    const nonce = 1781277000000
    const params = { b: '2', a: '1' }

    const sig = await client.sign(method, id, nonce, params)

    const expectedPayload = `${method}${id}${apiKey}a1b2${nonce}`
    const expected = createHmac('sha256', apiSecret).update(expectedPayload).digest('hex')
    expect(sig).toBe(expected)
  })

  it('signs empty params with an empty params string', async () => {
    const apiKey = 'k'
    const apiSecret = 's'
    const client = new CdcHttpClient({ apiKey, apiSecret })

    const sig = await client.sign('private/get-positions', 1, 1000, {})

    const expected = createHmac('sha256', apiSecret).update('private/get-positions1k1000').digest('hex')
    expect(sig).toBe(expected)
  })
})
