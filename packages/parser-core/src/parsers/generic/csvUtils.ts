// ---------------------------------------------------------------------------
// Amount parsing: handles parenthetical negatives and currency symbols
// ---------------------------------------------------------------------------

export function parseAmount(raw: string): number | null {
  let s = raw.trim()
  if (!s) return null
  const isNeg = s.startsWith('(') && s.endsWith(')')
  // Strip parentheses, currency symbols ($€£¥), commas, and leading 2–3 letter
  // currency codes (e.g. "SGD ", "RM ", "USD ")
  s = s.replace(/[()$€£¥,\s]/g, '').replace(/^[A-Z]{2,3}/, '')
  const n = parseFloat(s)
  if (isNaN(n)) return null
  return isNeg ? -Math.abs(n) : n
}

// ---------------------------------------------------------------------------
// Date normalisation: → ISO 8601 YYYY-MM-DD
// ---------------------------------------------------------------------------

export const MONTH_ABBR: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

export function normalizeDate(raw: string): string | null {
  // Strip time component (anything after first space or 'T')
  const s = raw.trim().split(/[\sT]/)[0]!

  // YYYY-MM-DD (already ISO)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s

  // YYYY/MM/DD
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(s)) {
    return s.replace(/\//g, '-')
  }

  // DD/MM/YYYY or MM/DD/YYYY (ambiguous — disambiguate by magnitude)
  const slashMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (slashMatch) {
    const [, a, b, y] = slashMatch
    const ai = parseInt(a!, 10)
    const bi = parseInt(b!, 10)
    let day: string, month: string
    if (ai > 12) {
      // First part must be day (DD/MM/YYYY)
      day = a!.padStart(2, '0'); month = b!.padStart(2, '0')
    } else if (bi > 12) {
      // Second part must be day (MM/DD/YYYY)
      month = a!.padStart(2, '0'); day = b!.padStart(2, '0')
    } else {
      // Ambiguous — default DD/MM/YYYY (most common outside US)
      day = a!.padStart(2, '0'); month = b!.padStart(2, '0')
    }
    return `${y}-${month}-${day}`
  }

  // DD-MM-YYYY or MM-DD-YYYY (same disambiguation logic)
  const dashNumMatch = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (dashNumMatch) {
    const [, a, b, y] = dashNumMatch
    const ai = parseInt(a!, 10)
    const bi = parseInt(b!, 10)
    let day: string, month: string
    if (ai > 12) {
      day = a!.padStart(2, '0'); month = b!.padStart(2, '0')
    } else if (bi > 12) {
      month = a!.padStart(2, '0'); day = b!.padStart(2, '0')
    } else {
      day = a!.padStart(2, '0'); month = b!.padStart(2, '0')
    }
    return `${y}-${month}-${day}`
  }

  // DD-MMM-YYYY (25-Dec-2025)
  const dashMonthMatch = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/)
  if (dashMonthMatch) {
    const [, d, mon, y] = dashMonthMatch
    const m = MONTH_ABBR[mon!.toLowerCase()]
    if (m) return `${y}-${m}-${d!.padStart(2, '0')}`
  }

  // DD MMM YYYY (25 Dec 2025) — re-join any space that was split above
  // We need to try the original raw string here
  const spaceMonthMatch = raw.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/)
  if (spaceMonthMatch) {
    const [, d, mon, y] = spaceMonthMatch
    const m = MONTH_ABBR[mon!.toLowerCase()]
    if (m) return `${y}-${m}-${d!.padStart(2, '0')}`
  }

  // MMM DD, YYYY (Dec 25, 2025)
  const mmmDdYyyy = raw.trim().match(/^([A-Za-z]{3})\s+(\d{1,2}),?\s+(\d{4})$/)
  if (mmmDdYyyy) {
    const [, mon, d, y] = mmmDdYyyy
    const m = MONTH_ABBR[mon!.toLowerCase()]
    if (m) return `${y}-${m}-${d!.padStart(2, '0')}`
  }

  // Fallback: try native Date.parse (timezone-safe: treat as UTC noon)
  const p = Date.parse(raw.trim())
  if (!isNaN(p)) {
    return new Date(p).toISOString().split('T')[0]!
  }

  return null
}

/**
 * Computes a stable fingerprint for a CSV's header row.
 * Finds the first row with 2+ non-empty columns, lowercases + sorts the values, joins with '|'.
 * Used to auto-match saved CustomParserProfiles to newly-uploaded files.
 */
export function computeHeaderFingerprint(rows: string[][]): string {
  for (const row of rows) {
    const cleaned = row.map(c => c.trim().toLowerCase()).filter(Boolean)
    if (cleaned.length >= 2) {
      return [...cleaned].sort().join('|')
    }
  }
  return ''
}
