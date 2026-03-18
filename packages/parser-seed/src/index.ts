import { Command } from 'commander'

// ─── Transformation utilities (exported for testing) ────────────────────────

/**
 * Replace the middle segment of a dash-separated account number with X's.
 * Input:  '621-234567-001'
 * Output: '621-XXXXX-001'
 */
export function redactAccountNo(accountNo: string): string {
  return accountNo.replace(/-(\d+)-/, (_, m: string) => `-${'X'.repeat(m.length)}-`)
}

/**
 * Replace every non-space character with an asterisk.
 * Input:  'John Doe'
 * Output: '**** ***'
 */
export function redactName(name: string): string {
  return name.replace(/[^\s]/g, '*')
}

/**
 * Shift an ISO date string (YYYY-MM-DD) forward by N days (UTC).
 * Input:  '2024-01-15', 5
 * Output: '2024-01-20'
 */
export function shiftDate(isoDate: string, days: number): string {
  const d = new Date(isoDate + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]!
}

/**
 * Fuzz a numeric amount by ±5–15% using a deterministic LCG seeded with `seed`.
 * Preserves the original sign. Result rounded to 2 decimal places.
 */
export function fuzzAmount(amount: number, seed: number): number {
  // Simple LCG — produces a value in [0, 1)
  const rand = ((seed * 1664525 + 1013904223) & 0x7fffffff) / 0x7fffffff
  // Map [0, 1) → [-0.15, +0.15]
  const delta = (rand - 0.5) * 0.3
  return Math.round(amount * (1 + delta) * 100) / 100
}

// ─── CLI ────────────────────────────────────────────────────────────────────

const program = new Command()

program
  .name('parser-seed')
  .description('Dev tool: anonymize bank statement CSV data for parser test fixtures')
  .version('0.0.1')

program
  .command('redact')
  .description('Anonymize a CSV from stdin, write to stdout')
  .option('--shift-days <n>', 'Days to shift dates forward', '7')
  .option('--seed <n>', 'RNG seed for amount fuzzing', '42')
  .action((opts: { shiftDays: string; seed: string }) => {
    const shiftDays = parseInt(opts.shiftDays, 10)
    const seed = parseInt(opts.seed, 10)
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk: string) => (data += chunk))
    process.stdin.on('end', () => {
      const lines = data.split('\n')
      // Header row stays unchanged; data rows get date-shifted and amount-fuzzed
      const out = lines.map((line, i) => {
        if (i === 0 || !line.trim()) return line
        const cols = line.split(',')
        if (cols.length < 8) return line
        // Col 0: Timestamp (UTC) — shift the date part (first 10 chars)
        const ts = cols[0] ?? ''
        const datePart = ts.slice(0, 10)
        const timePart = ts.slice(10)
        cols[0] = shiftDate(datePart, shiftDays) + timePart
        // Col 7: Native Amount — fuzz by ±15% with per-row seed offset
        const native = parseFloat(cols[7] ?? '0')
        if (!isNaN(native) && native !== 0) {
          cols[7] = String(fuzzAmount(native, seed + i))
        }
        return cols.join(',')
      })
      process.stdout.write(out.join('\n'))
    })
  })

// Only run the CLI when this file is the process entry point (not when imported by tests)
const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] != null &&
  new URL(import.meta.url).pathname.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop()!)

if (isMain) {
  program.parse(process.argv)
}

