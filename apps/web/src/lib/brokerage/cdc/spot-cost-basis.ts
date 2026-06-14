/**
 * Spot cost-basis engine — pure weighted-average cost computation.
 *
 * The Crypto.com Exchange API provides no cost basis for spot holdings
 * (only quantity + market value), so basis is reconstructed from the
 * synced trade and transfer history:
 *
 *   BUY        quantity += q, totalCost += price×q + fee
 *   SELL       proportional cost removal, realizedPnl += proceeds − removedCost
 *   DEPOSIT    quantity += q at market price on the event date (estimated)
 *   WITHDRAWAL proportional quantity/cost reduction, no P&L impact
 *
 * Basis quality degrades monotonically: ok → estimated (some basis is
 * market-priced rather than traded) → incomplete (unpriced events, oversells,
 * or reconciliation against the authoritative balance was needed).
 *
 * Pure module — no I/O, no Date.now(); fully unit-testable.
 */

export type BasisEventType = 'BUY' | 'SELL' | 'DEPOSIT' | 'WITHDRAWAL'

export type BasisQuality = 'ok' | 'estimated' | 'incomplete'

export interface BasisEvent {
  type: BasisEventType
  /** Epoch ms — events are processed in ascending timestamp order */
  timestamp: number
  /** Always positive; the type carries the direction */
  quantity: number
  /**
   * USD price per unit. BUY/SELL: traded price. DEPOSIT: market price on
   * the event date, or null when the lookup failed (enters at zero cost
   * and degrades quality to `incomplete`). Ignored for WITHDRAWAL.
   */
  price: number | null
  /** USD fee — added to cost on BUY, subtracted from proceeds on SELL */
  fee?: number
}

export interface BasisState {
  /** Computed quantity after replaying all events */
  quantity: number
  /** Total USD cost of the currently held quantity */
  totalCost: number
  /** totalCost / quantity (0 when nothing is held) */
  avgCost: number
  /** Accumulated realized P&L from SELL events */
  realizedPnl: number
  basisQuality: BasisQuality
  /** Human-readable notes about estimates, gaps, and adjustments */
  diagnostics: string[]
}

const QUALITY_RANK: Record<BasisQuality, number> = { ok: 0, estimated: 1, incomplete: 2 }

/** Quantities this small are treated as zero (floating-point dust) */
const EPSILON = 1e-12

/** Relative divergence tolerated before reconciliation kicks in (0.1%) */
export const RECONCILE_TOLERANCE = 0.001

function degrade(current: BasisQuality, to: BasisQuality): BasisQuality {
  return QUALITY_RANK[to] > QUALITY_RANK[current] ? to : current
}

/**
 * Replay basis events (sorted by timestamp ascending) into a weighted-average
 * cost state.
 */
export function computeCostBasis(events: BasisEvent[]): BasisState {
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp)

  let quantity = 0
  let totalCost = 0
  let realizedPnl = 0
  let quality: BasisQuality = 'ok'
  const diagnostics: string[] = []

  for (const event of sorted) {
    const q = event.quantity
    if (q <= 0) continue
    const fee = event.fee ?? 0

    switch (event.type) {
      case 'BUY': {
        quantity += q
        totalCost += (event.price ?? 0) * q + fee
        break
      }

      case 'SELL': {
        let sellQty = q
        if (sellQty > quantity + EPSILON) {
          // Selling more than tracked — history gap before the retention
          // window. Clamp and flag; reconciliation reports the shortfall.
          diagnostics.push(
            `Sold ${sellQty} with only ${quantity} tracked — history gap before the exchange's retention window`
          )
          quality = degrade(quality, 'incomplete')
          sellQty = quantity
        }
        if (sellQty <= EPSILON) break
        const removedCost = quantity > EPSILON ? totalCost * (sellQty / quantity) : 0
        const proceeds = (event.price ?? 0) * sellQty - fee
        realizedPnl += proceeds - removedCost
        totalCost -= removedCost
        quantity -= sellQty
        break
      }

      case 'DEPOSIT': {
        quantity += q
        if (event.price !== null) {
          totalCost += event.price * q + fee
          quality = degrade(quality, 'estimated')
        } else {
          // Price lookup failed — enters at zero cost
          diagnostics.push(`Deposit of ${q} entered at zero cost (no price available for the event date)`)
          quality = degrade(quality, 'incomplete')
        }
        break
      }

      case 'WITHDRAWAL': {
        let outQty = q
        if (outQty > quantity + EPSILON) {
          diagnostics.push(
            `Withdrew ${outQty} with only ${quantity} tracked — history gap before the exchange's retention window`
          )
          quality = degrade(quality, 'incomplete')
          outQty = quantity
        }
        if (outQty <= EPSILON) break
        const removedCost = quantity > EPSILON ? totalCost * (outQty / quantity) : 0
        totalCost -= removedCost
        quantity -= outQty
        break
      }
    }
  }

  // Clear floating-point dust
  if (Math.abs(quantity) <= EPSILON) {
    quantity = 0
    totalCost = 0
  }

  return {
    quantity,
    totalCost,
    avgCost: quantity > EPSILON ? totalCost / quantity : 0,
    realizedPnl,
    basisQuality: quality,
    diagnostics,
  }
}

/**
 * Reconcile a computed basis state against the authoritative quantity
 * reported by the exchange (`user-balance`).
 *
 * Divergence within RECONCILE_TOLERANCE (relative) is ignored as dust.
 * Larger divergence is corrected with a synthetic adjustment — missing
 * quantity enters at the current market price (or zero cost when unknown),
 * excess is removed proportionally — and flags the basis `incomplete`.
 */
export function reconcile(state: BasisState, authoritativeQuantity: number, currentPrice: number | null): BasisState {
  const diff = authoritativeQuantity - state.quantity
  const scale = Math.max(Math.abs(authoritativeQuantity), Math.abs(state.quantity), EPSILON)
  if (Math.abs(diff) / scale <= RECONCILE_TOLERANCE) {
    return state
  }

  const diagnostics = [...state.diagnostics]
  let { totalCost } = state

  if (diff > 0) {
    const addedCost = currentPrice !== null ? diff * currentPrice : 0
    totalCost += addedCost
    diagnostics.push(
      `Reconciled +${diff} against the exchange balance (entered at ${
        currentPrice !== null ? `market price ${currentPrice}` : 'zero cost'
      }) — ledger history is incomplete`
    )
  } else {
    const removeQty = Math.min(-diff, state.quantity)
    const removedCost = state.quantity > EPSILON ? totalCost * (removeQty / state.quantity) : 0
    totalCost -= removedCost
    diagnostics.push(`Reconciled ${diff} against the exchange balance — ledger history is incomplete`)
  }

  const quantity = authoritativeQuantity
  return {
    quantity,
    totalCost,
    avgCost: quantity > EPSILON ? totalCost / quantity : 0,
    realizedPnl: state.realizedPnl,
    basisQuality: 'incomplete',
    diagnostics,
  }
}
