/**
 * CDC position basis enrichment — fills in avgCost / unrealizedPnl on
 * synced Crypto.com positions using the spot cost-basis engine.
 *
 * Runs after a CDC sync persists transactions and fund details:
 *   1. Group CDC positions by token (spot + staked share one basis)
 *   2. Build basis events from trades, transfers, and staking rewards
 *   3. computeCostBasis → reconcile against the exchange-reported quantity
 *   4. Write avgCost/unrealizedPnl onto positions; basis quality and
 *      diagnostics into position extensions (rendered by Holdings)
 */

import type {
  BrokerageFundDetail,
  BrokeragePosition,
  BrokeragePositionExtension,
  BrokerageTransaction,
} from '@lokfi/brokerage-core'
import type { LokfiDatabase } from '../../db/db'
import { loadOpeningCostOverrides } from '../../investments/costBasisOverrides'
import { getSecurityKey } from '../../investments/portfolioBuckets'
import { SOURCE, splitInstrument } from './cdc-adapter'
import type { BasisEvent } from './spot-cost-basis'
import { RECONCILE_TOLERANCE, computeCostBasis, reconcile } from './spot-cost-basis'

/** Resolve a token's USD daily close on a yyyy-mm-dd date (null = unknown) */
export type PriceLookup = (token: string, date: string) => Promise<number | null>

/** Manual opening-cost overrides: securityKey (e.g. `CRYPTO:BTC`) → per-unit cost */
export type OpeningCostOverrides = Map<string, number>

/** Tokens treated as USD-pegged cash: basis is 1.0, no event replay needed */
const STABLE_TOKENS = new Set(['USD', 'USDT', 'USDC', 'TUSD', 'DAI', 'PYUSD', 'FDUSD'])

/** Quote currencies treated as 1:1 USD when pricing trades */
const USD_QUOTES = new Set(['USD', 'USDT', 'USDC'])

export const BASIS_QUALITY_EXT_KEY = 'basisQuality'
export const BASIS_DIAGNOSTICS_EXT_KEY = 'basisDiagnostics'
export const REALIZED_PNL_EXT_KEY = 'basisRealizedPnl'
/** Quantity of the unexplained opening remainder that the opening cost prices (0 = fully tracked) */
export const OPENING_QTY_EXT_KEY = 'basisOpeningQty'

export interface BasisEnrichmentResult {
  positions: BrokeragePosition[]
  extensions: BrokeragePositionExtension[]
}

/**
 * Compute enriched positions + extensions from CDC records.
 * Pure aside from the injected price lookup — unit-testable without Dexie.
 */
export async function computeCdcBasisEnrichment(
  positions: BrokeragePosition[],
  transactions: BrokerageTransaction[],
  fundDetails: BrokerageFundDetail[],
  priceLookup: PriceLookup,
  overrides: OpeningCostOverrides = new Map()
): Promise<BasisEnrichmentResult> {
  const updatedPositions: BrokeragePosition[] = []
  const extensions: BrokeragePositionExtension[] = []

  // Spot and staked positions of the same token share one basis pool —
  // staking moves quantity between them without a ledger event.
  const byToken = new Map<string, BrokeragePosition[]>()
  for (const pos of positions) {
    if (pos.source !== SOURCE) continue
    const group = byToken.get(pos.symbol) ?? []
    group.push(pos)
    byToken.set(pos.symbol, group)
  }

  for (const [token, tokenPositions] of byToken) {
    const totalQty = tokenPositions.reduce((sum, p) => sum + p.quantity, 0)

    let avgCost: number
    let quality: string
    let diagnostics: string[]
    let realizedPnl = 0
    // Quantity of the unexplained opening remainder (0 = fully tracked); drives
    // the Holdings "Initial cost per unit" field.
    let openingQty = 0

    if (STABLE_TOKENS.has(token)) {
      avgCost = 1
      quality = 'ok'
      diagnostics = []
    } else {
      const events = await buildBasisEvents(token, transactions, fundDetails, priceLookup)
      const computed = computeCostBasis(events)

      const diff = totalQty - computed.quantity
      const scale = Math.max(Math.abs(totalQty), Math.abs(computed.quantity), 1e-12)
      openingQty = diff / scale > RECONCILE_TOLERANCE ? diff : 0

      // Price the unexplained opening remainder. Priority: manual override >
      // earliest-activity-date estimate > none. Pricing at a fixed historical
      // date (never current market) keeps the basis from drifting. The
      // earliest-activity date is pinned once the first sync captures the
      // available window; it can only shift if the history window later
      // expands, which the API-only scope (≤180 days, append-only store) does
      // not allow. With no history at all we leave it unpriced (incomplete)
      // so the user can set an opening cost via the override.
      const securityKey = getSecurityKey(tokenPositions[0])
      const override = overrides.get(securityKey)
      let openingPrice: number | null
      let usedOverride = false
      if (override != null) {
        openingPrice = override
        usedOverride = true
      } else if (events.length > 0) {
        const earliestTs = Math.min(...events.map((e) => e.timestamp))
        openingPrice = await priceLookup(token, new Date(earliestTs).toISOString().slice(0, 10))
      } else {
        openingPrice = null
      }

      const reconciled = reconcile(computed, totalQty, openingPrice)
      avgCost = reconciled.avgCost
      diagnostics = reconciled.diagnostics
      realizedPnl = reconciled.realizedPnl
      // reconcile produces `estimated` for any non-null opening price; promote
      // to `manual` only when that price came from a user override (and a
      // remainder was actually priced — otherwise the override is inert).
      quality = usedOverride && reconciled.basisQuality === 'estimated' ? 'manual' : reconciled.basisQuality
    }

    for (const pos of tokenPositions) {
      const costBasis = avgCost * pos.quantity
      const marketValue = pos.marketValue ?? 0
      const unrealizedPnl = marketValue - costBasis
      updatedPositions.push({
        ...pos,
        avgCost,
        unrealizedPnl,
        unrealizedPnlPercent: costBasis > 0 ? unrealizedPnl / costBasis : undefined,
      })
      extensions.push(
        { positionId: pos.id, key: BASIS_QUALITY_EXT_KEY, value: JSON.stringify(quality) },
        { positionId: pos.id, key: BASIS_DIAGNOSTICS_EXT_KEY, value: JSON.stringify(diagnostics) },
        { positionId: pos.id, key: REALIZED_PNL_EXT_KEY, value: JSON.stringify(realizedPnl) },
        { positionId: pos.id, key: OPENING_QTY_EXT_KEY, value: JSON.stringify(openingQty) }
      )
    }
  }

  return { positions: updatedPositions, extensions }
}

/** Build the chronologically unsorted event list for one token */
async function buildBasisEvents(
  token: string,
  transactions: BrokerageTransaction[],
  fundDetails: BrokerageFundDetail[],
  priceLookup: PriceLookup
): Promise<BasisEvent[]> {
  const events: BasisEvent[] = []

  for (const txn of transactions) {
    if (txn.source !== SOURCE) continue
    const { base, quote } = splitInstrument(txn.symbol)
    const timestamp = Date.parse(txn.executedAt)
    const date = txn.executedAt.slice(0, 10)

    if (base === token) {
      if (USD_QUOTES.has(quote)) {
        events.push({
          type: txn.action === 'BUY' ? 'BUY' : 'SELL',
          timestamp,
          quantity: txn.quantity,
          price: txn.price,
          fee: txn.commission,
        })
      } else {
        // Cross-pair trade (e.g. ETH_BTC): no USD price on the fill — value
        // at the daily close. DEPOSIT/WITHDRAWAL semantics keep the basis
        // quality honest (`estimated`, or `incomplete` if the lookup fails).
        events.push({
          type: txn.action === 'BUY' ? 'DEPOSIT' : 'WITHDRAWAL',
          timestamp,
          quantity: txn.quantity,
          price: await priceLookup(token, date),
        })
      }
    } else if (quote === token && !STABLE_TOKENS.has(token)) {
      // Token spent/received as the quote side of a cross pair
      events.push({
        type: txn.action === 'BUY' ? 'WITHDRAWAL' : 'DEPOSIT',
        timestamp,
        quantity: txn.quantity * txn.price,
        price: await priceLookup(token, date),
      })
    }
  }

  for (const fd of fundDetails) {
    if (fd.source !== SOURCE || fd.symbol !== token) continue
    const timestamp = Date.parse(fd.businessDate)
    const date = fd.businessDate.slice(0, 10)
    const qty = fd.quantity ?? Math.abs(fd.amount)
    if (qty <= 0) continue

    switch (fd.classifiedType) {
      case 'TRANSFER_IN':
        events.push({ type: 'DEPOSIT', timestamp, quantity: qty, price: await priceLookup(token, date) })
        break
      case 'TRANSFER_OUT':
        events.push({ type: 'WITHDRAWAL', timestamp, quantity: qty, price: null })
        break
      case 'DEPOSIT_WITHDRAWAL':
        if (fd.amount >= 0) {
          events.push({ type: 'DEPOSIT', timestamp, quantity: qty, price: await priceLookup(token, date) })
        } else {
          events.push({ type: 'WITHDRAWAL', timestamp, quantity: qty, price: null })
        }
        break
      case 'DIVIDEND': {
        // Staking rewards are acquisitions at the event-date market price.
        // The reward record already carries its USD value when available.
        const price = fd.amount > 0 && fd.quantity ? fd.amount / fd.quantity : await priceLookup(token, date)
        events.push({ type: 'DEPOSIT', timestamp, quantity: qty, price })
        break
      }
      default:
        break
    }
  }

  return events
}

/**
 * Read CDC records from Dexie, compute enrichment, and persist updated
 * positions + basis extensions. Call after a successful CDC sync (including
 * deep syncs — recomputation is idempotent over the stored ledger).
 */
export async function enrichCdcPositions(db: LokfiDatabase, priceLookup: PriceLookup): Promise<void> {
  const positions = await db.brokeragePositions.filter((p) => p.source === SOURCE).toArray()
  if (positions.length === 0) return

  const transactions = await db.brokerageTransactions.where('source').equals(SOURCE).toArray()
  const fundDetails = await db.brokerageFundDetails.where('source').equals(SOURCE).toArray()
  const overrides = await loadOpeningCostOverrides(db)

  const { positions: updated, extensions } = await computeCdcBasisEnrichment(
    positions,
    transactions,
    fundDetails,
    priceLookup,
    overrides
  )

  await db.brokeragePositions.bulkPut(updated)
  if (extensions.length > 0) {
    await db.brokeragePositionExtensions.bulkPut(extensions)
  }
}
