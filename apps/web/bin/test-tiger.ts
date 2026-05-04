/**
 * Tiger API Verification Script
 *
 * Usage:
 *   pnpm --filter @lokfi/web test-tiger
 *
 * Credentials are loaded from, in order:
 *   1. A .env file in apps/web/ (copy .env.example to .env)
 *   2. Shell environment variables
 *
 * The .env file is recommended — copy apps/web/.env.example to apps/web/.env
 * and fill in your values:
 *
 *   TIGER_ID=your_developer_id
 *   TIGER_PRIVATE_KEY=MIIEvQIBA...  (PKCS8 base64, no PEM headers needed)
 *   TIGER_ACCOUNT=U1234567
 *
 * Or set inline:
 *   $env:TIGER_ID="your_id"; $env:TIGER_PRIVATE_KEY="MIIEvQI..."; pnpm --filter @lokfi web test-tiger
 */

import 'dotenv/config'
import * as fs from 'node:fs'
import { TigerAuthError, TigerHttpClient, TigerHttpError } from '../src/lib/brokerage/tiger/tiger-http-client'
import type { TigerAsset, TigerCorpAction, TigerOrder, TigerPosition } from '../src/lib/brokerage/tiger/tiger-types'

// ── Helpers ────────────────────────────────────────────────────────────────

/** Tiger API wraps many responses in { items: T[] } */
interface ItemResponse<T> {
  items?: T[]
}

/** Unwrap a response that may be a direct array or { items: T[] } */
function unwrapItems<T>(raw: ItemResponse<T> | T[] | undefined): T[] {
  if (Array.isArray(raw)) return raw
  return raw?.items ?? []
}

const bold = (s: string) => `\x1b[1m${s}\x1b[22m`
const green = (s: string) => `\x1b[32m${s}\x1b[39m`
const red = (s: string) => `\x1b[31m${s}\x1b[39m`
const yellow = (s: string) => `\x1b[33m${s}\x1b[39m`
const dim = (s: string) => `\x1b[2m${s}\x1b[22m`
const cyan = (s: string) => `\x1b[36m${s}\x1b[39m`

function check(text: string): string {
  return `${green('✓')} ${text}`
}

function fail(text: string): string {
  return `${red('✗')} ${text}`
}

function section(title: string): void {
  console.log(`\n${bold(cyan('───'))} ${bold(title)} ${bold(cyan('─'.repeat(Math.max(0, 60 - title.length))))}`)
}

function fmtMoney(n: number | undefined, currency: string): string {
  if (n === undefined) return dim('N/A')
  return n.toLocaleString('en-US', { style: 'currency', currency })
}

function fmtPercent(n: number | undefined): string {
  if (n === undefined) return dim('N/A')
  const sign = n >= 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}%`
}

function readPrivateKey(value: string): string {
  // Case 1: Already a PEM string with headers — use as-is
  if (value.includes('-----BEGIN')) {
    return value
  }

  // Case 2: It's an existing file on disk — read it
  try {
    if (fs.existsSync(value)) {
      return fs.readFileSync(value, 'utf-8')
    }
  } catch {
    // not a valid path
  }

  // Case 3: Raw base64 string (from .env or env var) — wrap with PKCS8 envelope
  const body = value.replace(/\s/g, '')
  return `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----`
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(bold('Tiger OpenAPI — Connection Verification\n'))
  console.log(dim(`API Base: https://openapi.tigerfintech.com`))
  console.log(dim(`SDK Ref:  @tigeropenapi/tigeropen v0.1.0\n`))

  // ── Load credentials ──────────────────────────────────────────────────

  const tigerId = process.env.TIGER_ID
  const privateKeyRaw = process.env.TIGER_PRIVATE_KEY
  const account = process.env.TIGER_ACCOUNT

  if (!tigerId || !privateKeyRaw || !account) {
    console.log(red('Missing credentials. Set the following environment variables:\n'))
    console.log(`  ${cyan('TIGER_ID')}          — your Tiger developer ID`)
    console.log(`  ${cyan('TIGER_PRIVATE_KEY')} — PKCS8 private key (base64 string, or path to PEM file)`)
    console.log(`  ${cyan('TIGER_ACCOUNT')}     — your Tiger trading account number`)
    console.log(`\n${yellow('Use your PKCS#8 key, not PKCS#1.')} The key can be the raw base64 string `)
    console.log(`${yellow('from the Tiger Developer Center — no PEM headers needed.')}`)
    console.log(`\n${dim('Example (PowerShell):')}`)
    console.log(dim('  $env:TIGER_ID="your_id"'))
    console.log(dim('  $env:TIGER_PRIVATE_KEY="MIIEvQIBADANBgkqhkiG..."  # raw base64 from Tiger'))
    console.log(dim('  $env:TIGER_ACCOUNT="U1234567"'))
    process.exit(1)
  }

  const privateKey = readPrivateKey(privateKeyRaw)

  console.log(dim(`Tiger ID:  ${tigerId.slice(0, 4)}...`))
  console.log(dim(`Account:   ${account}`))
  console.log(
    dim(
      `Key:       ${
        privateKeyRaw.includes('-----BEGIN')
          ? privateKeyRaw.includes('BEGIN PRIVATE KEY')
            ? 'PKCS8 PEM'
            : 'PKCS1 PEM (may need conversion)'
          : privateKeyRaw.includes('\\') || privateKeyRaw.includes('/') || privateKeyRaw.includes('\n')
            ? 'File (loaded)'
            : 'raw base64 (auto-wrapped as PKCS8)'
      }`
    )
  )

  // ── Initialize client ─────────────────────────────────────────────────

  const client = new TigerHttpClient({
    tigerId,
    privateKey,
    account,
    language: 'en_US',
  })

  // Helper: build bizContent with account injected
  const biz = (extra?: Record<string, unknown>) => JSON.stringify({ account, ...extra })

  // ── Step 1: Validate connection ───────────────────────────────────────

  section('1. Connection Check')

  try {
    const assets = unwrapItems(
      await client.execute<ItemResponse<TigerAsset>>({
        method: 'assets',
        bizContent: biz(),
      })
    )
    console.log(check(`Authenticated successfully — received ${assets.length} asset record(s)`))
    if (assets.length > 0 && assets[0]) {
      console.log(
        dim(
          `   A/C ${assets[0].currency}: netLiq=${assets[0].netLiquidation} cash=${assets[0].cashValue} unrealPnL=${assets[0].unrealizedPnL}`
        )
      )
    }
  } catch (err) {
    if (err instanceof TigerAuthError) {
      console.log(fail(`Authentication failed: ${err.message}`))
      console.log(dim('\n   Troubleshooting:'))
      console.log(dim('   - Ensure the private key is PKCS8 format (BEGIN PRIVATE KEY)'))
      console.log(dim('   - Verify the public key is uploaded in the Tiger Developer Center'))
      console.log(dim('   - Check that your tiger_id is correct'))
    } else if (err instanceof TigerHttpError) {
      console.log(fail(`API error: [${err.code}] ${err.message}`))
    } else {
      console.log(fail(`Connection failed: ${err instanceof Error ? err.message : String(err)}`))
    }
    process.exit(1)
  }

  // ── Step 2: Positions ─────────────────────────────────────────────────

  section('2. Positions')

  try {
    const positions = unwrapItems(
      await client.execute<ItemResponse<TigerPosition>>({
        method: 'positions',
        bizContent: biz(),
      })
    )
    console.log(check(`Fetched ${bold(String(positions.length))} position(s)`))

    if (positions.length > 0 && positions.length < 500) {
      console.log()
      // Table header
      console.log(
        `  ${bold('Symbol'.padEnd(12))} ${bold('Qty'.padStart(10))} ${bold('AvgCost'.padStart(12))} ${bold('MktVal'.padStart(14))} ${bold('P&L'.padStart(12))} ${bold('P&L%'.padStart(8))}  ${bold('Currency')}`
      )
      console.log(`  ${'─'.repeat(80)}`)
      for (const p of positions) {
        const pnlColor = (p.unrealizedPnl ?? 0) >= 0 ? green : red
        const name = (p.name || p.symbol).slice(0, 12)
        console.log(
          `  ${name.padEnd(12)} ${String(p.position).padStart(10)} ${fmtMoney(p.averageCost, p.currency || 'USD').padStart(12)} ${fmtMoney(p.marketValue, p.currency || 'USD').padStart(14)} ${pnlColor(fmtMoney(p.unrealizedPnl, p.currency || 'USD').padStart(12))} ${pnlColor(fmtPercent(p.unrealizedPnlPercent).padStart(8))}  ${p.currency || 'USD'}`
        )
      }
      // Totals
      const totalMktVal = positions.reduce((sum, p) => sum + (p.marketValue ?? 0), 0)
      const totalPnl = positions.reduce((sum, p) => sum + (p.unrealizedPnl ?? 0), 0)
      const pnlColor = totalPnl >= 0 ? green : red
      console.log(`  ${'─'.repeat(80)}`)
      console.log(
        `  ${'TOTAL'.padEnd(12)} ${''.padStart(10)} ${''.padStart(12)} ${fmtMoney(totalMktVal, 'USD').padStart(14)} ${pnlColor(fmtMoney(totalPnl, 'USD').padStart(12))}`
      )
    } else {
      console.log(dim('   No open positions found.'))
    }
  } catch (err) {
    console.log(fail(`Failed to fetch positions: ${err instanceof Error ? err.message : String(err)}`))
  }

  // ── Step 3: Account Summary ───────────────────────────────────────────

  section('3. Account Summary')

  try {
    const items = unwrapItems(
      await client.execute<ItemResponse<TigerAsset>>({
        method: 'assets',
        bizContent: biz(),
      })
    )

    if (items.length > 0) {
      // Show top-level asset summary
      console.log()
      console.log(
        `  ${bold('Currency'.padStart(8))} ${bold('NetLiq'.padStart(14))} ${bold('Cash'.padStart(14))} ${bold('BuyingPwr'.padStart(14))} ${bold('UnrealPnL'.padStart(14))}`
      )
      console.log(`  ${'─'.repeat(65)}`)
      for (const a of items) {
        console.log(
          `  ${(a.currency || 'USD').padStart(8)} ${fmtMoney(a.netLiquidation, a.currency || 'USD').padStart(14)} ${fmtMoney(a.cashValue, a.currency || 'USD').padStart(14)} ${fmtMoney(a.buyingPower, a.currency || 'USD').padStart(14)} ${fmtMoney(a.unrealizedPnL, a.currency || 'USD').padStart(14)}`
        )
      }

      // Show per-segment breakdown
      for (const a of items) {
        if (a.segments && a.segments.length > 0) {
          console.log(`\n  ${bold('Segments:')}`)
          console.log(
            `  ${bold('Category'.padEnd(12))} ${bold('NetLiq'.padStart(14))} ${bold('Cash'.padStart(14))} ${bold('Avail'.padStart(14))} ${bold('InitMargin'.padStart(14))}`
          )
          console.log(`  ${'─'.repeat(70)}`)
          for (const seg of a.segments) {
            const cat = seg.category === 'S' ? 'Stocks' : seg.category === 'C' ? 'Futures' : seg.category
            console.log(
              `  ${(cat || 'N/A').padEnd(12)} ${fmtMoney(seg.netLiquidation, a.currency || 'USD').padStart(14)} ${fmtMoney(seg.cashValue, a.currency || 'USD').padStart(14)} ${fmtMoney(seg.availableFunds, a.currency || 'USD').padStart(14)} ${fmtMoney(seg.initMarginReq, a.currency || 'USD').padStart(14)}`
            )
          }
        }
      }
    } else {
      console.log(dim('   No account data returned.'))
    }
  } catch (err) {
    console.log(fail(`Failed to fetch account: ${err instanceof Error ? err.message : String(err)}`))
  }

  // ── Step 4: Recent Orders ─────────────────────────────────────────────

  section('4. Recent Filled Orders (last 30 days)')

  try {
    const since = new Date()
    since.setDate(since.getDate() - 30)

    // Tiger API uses start_date/end_date, response is { items: [...] }
    const orders = unwrapItems(
      await client.execute<ItemResponse<TigerOrder>>({
        method: 'filled_orders',
        bizContent: biz({
          start_date: since.toISOString().slice(0, 10),
          end_date: new Date().toISOString().slice(0, 10),
        }),
      })
    )

    console.log(check(`Fetched ${bold(String(orders.length))} filled order(s)`))

    if (orders.length > 0) {
      console.log()
      console.log(
        `  ${bold('Time'.padEnd(22))} ${bold('Symbol'.padEnd(10))} ${bold('Type'.padStart(5))} ${bold('Action'.padStart(6))} ${bold('Qty'.padStart(8))} ${bold('Price'.padStart(10))} ${bold('Status'.padStart(16))}`
      )
      console.log(`  ${'─'.repeat(80)}`)

      const recent = orders.slice(-10)
      for (const o of recent) {
        const time = o.latestTime
          ? new Date(o.latestTime).toISOString().replace('T', ' ').slice(0, 19)
          : dim('N/A'.padStart(19))
        const actionColor = (o.action || '').toUpperCase() === 'BUY' ? green : red
        const type = (o.secType || '').padStart(5)
        console.log(
          `  ${time.padEnd(22)} ${(o.symbol || '').padEnd(10)} ${type} ${actionColor((o.action || '').padStart(6))} ${String(o.totalQuantity).padStart(8)} ${fmtMoney(o.avgFillPrice, o.currency || 'USD').padStart(10)} ${(o.status || '').padStart(16)}`
        )
      }
    } else {
      console.log(dim('   No filled orders in this period.'))
    }
  } catch (err) {
    console.log(fail(`Failed to fetch orders: ${err instanceof Error ? err.message : String(err)}`))
  }

  // ── Step 5: Corporate Actions ─────────────────────────────────────────

  section('5. Corporate Actions (last 90 days)')

  try {
    const since = new Date()
    since.setDate(since.getDate() - 90)
    const start = since.toISOString().slice(0, 10)
    const end = new Date().toISOString().slice(0, 10)

    const actions = unwrapItems(
      await client.execute<ItemResponse<TigerCorpAction>>({
        method: 'fund_details',
        bizContent: biz({
          fund_type: 'CORPORATE_ACTION',
          seg_types: ['SEC'],
          start_date: start,
          end_date: end,
          limit: 100,
        }),
      })
    )

    if (actions.length > 0) {
      console.log(check(`Fetched ${bold(String(actions.length))} corporate action(s)`))
      console.log()
      for (const a of actions) {
        console.log(
          `  ${dim(a.businessDate || 'N/A')}  ${yellow(a.desc || 'Unknown')}  ${fmtMoney(a.amount, a.currency || 'USD')}`
        )
      }
    } else {
      console.log(dim('   No corporate actions in this period.'))
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.log(yellow(`⚠ Corporate actions unavailable: ${msg}`))
    console.log(dim('   The fund_details endpoint returns "server error" (code 1) for this'))
    console.log(dim('   account. This may require additional permissions from Tiger.'))
  }

  // ── Summary ───────────────────────────────────────────────────────────

  section('Result')

  console.log(`\n  ${green('✓ Connection working')}  — Tiger OpenAPI is accessible with your credentials.\n`)
  console.log(dim('  The lokfi sync pipeline uses these same API calls through the'))
  console.log(dim('  TigerProvider → SyncOrchestrator → Dexie pipeline.\n'))
}

main().catch((err) => {
  console.error(red(`\nFatal error: ${err instanceof Error ? err.message : String(err)}`))
  process.exit(1)
})
