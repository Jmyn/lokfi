// Noise words to strip from descriptions when extracting merchant names
// Reuses the same set from suggestRules.ts conceptually
const NOISE = new Set([
  'POS',
  'IBG',
  'PURCHASE',
  'DEBIT',
  'CREDIT',
  'TRANSFER',
  'PAYMENT',
  'TRF',
  'CR',
  'DR',
  'REF',
  'NETS',
  'NETSQR',
  'PAYNOW',
  'PAYLAH',
  'GIRO',
  'ATM',
  'VISA',
  'MASTERCARD',
  'CONTACTLESS',
  'CARDLESS',
  'INTERBANK',
  'OVERSEAS',
  'FAST',
])

export function extractMerchant(description: string): string {
  const grab = description.match(
    /^\s*(?:POS\s+)?Grab\s*\*?\s*(?:(rides?|food|mart|express)\b\s*)?(?=A-[A-Z\d]{10,}\b)/i
  )
  if (grab) {
    const service = grab[1]?.toLowerCase()
    if (service?.startsWith('ride')) return 'Grab Rides'
    return service ? `Grab${service[0]?.toUpperCase()}${service.slice(1)}` : 'Grab'
  }

  // Try "to [MERCHANT]" pattern first
  const toMatch = description.match(/\bto\s+(.+?)(?=\s*via\b|$)/i)
  if (toMatch) {
    const merchant = toMatch[1].replace(/\s+/g, ' ').trim()
    if (merchant.length >= 3) return merchant
  }

  // Strip noise prefixes, then take text before first numeric reference
  const tokens = description.split(/[\s\-\/]+/)
  const meaningful: string[] = []
  let pastNoise = false

  for (const token of tokens) {
    const upper = token.toUpperCase().replace(/[^A-Z]/g, '')
    if (!pastNoise && NOISE.has(upper)) continue
    if (/^\d{4,}$/.test(token)) break // stop at reference numbers
    pastNoise = true
    meaningful.push(token)
  }

  const result = meaningful.join(' ').replace(/\s+/g, ' ').trim()
  return result.length >= 3 ? result : description.slice(0, 30).trim()
}
