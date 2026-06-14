/**
 * Crypto.com Exchange v1 API types.
 *
 * Covers only the endpoints used by the read-only portfolio integration:
 * user-balance, get-trades, get-transactions, deposit/withdrawal history,
 * staking position & reward history, get-instruments, get-candlestick.
 *
 * The exchange serializes decimal values as strings ("0.5"); fields typed
 * `string` here are decimal strings unless noted. Epoch timestamps are
 * numbers (ms) or strings (ns).
 */

// ── Client config & envelope ──────────────────────────────────────────────

export interface CdcClientConfig {
  apiKey: string
  apiSecret: string
  /** Default: https://api.crypto.com/exchange/v1 (UAT: https://uat-api.3ona.co/exchange/v1) */
  serverUrl?: string
}

/** Params object for a request. Nested objects/arrays allowed per the signing spec. */
export type CdcParams = Record<string, unknown>

export interface CdcApiRequest {
  method: string
  params?: CdcParams
}

export interface CdcApiResponse<T> {
  id: number
  method: string
  code: number
  message?: string
  result?: T
}

// ── private/user-balance ──────────────────────────────────────────────────

export interface CdcPositionBalance {
  /** Token, e.g. "BTC", or staked instrument, e.g. "SOL.staked" */
  instrument_name: string
  quantity: string
  market_value: string
  collateral_eligible?: boolean
  collateral_amount?: string
  haircut?: string
  reserved_qty?: string
  max_withdrawal_balance?: string
}

export interface CdcUserBalance {
  /** Settlement currency of the unified account (e.g. "USD") */
  instrument_name?: string
  total_available_balance: string
  total_margin_balance?: string
  total_initial_margin?: string
  total_maintenance_margin?: string
  total_position_cost?: string
  /** Wallet Balance (Deposits - Withdrawals + Realized PnL - Fees) */
  total_cash_balance: string
  total_collateral_value?: string
  total_session_unrealized_pnl?: string
  total_session_realized_pnl?: string
  is_liquidating?: boolean
  total_effective_leverage?: string
  position_balances: CdcPositionBalance[]
}

export interface CdcUserBalanceResult {
  data: CdcUserBalance[]
}

// ── private/get-trades ────────────────────────────────────────────────────

export interface CdcTrade {
  account_id: string
  event_date: string
  journal_type: string
  traded_quantity: string
  traded_price: string
  /** Negative = fee charged */
  fees: string
  fee_instrument_name?: string
  fee_credits?: string
  order_id: string
  trade_id: string
  trade_match_id?: string
  client_oid?: string
  taker_side?: 'MAKER' | 'TAKER' | string
  side: 'BUY' | 'SELL'
  instrument_name: string
  /** Epoch ms */
  create_time: number
  /** Epoch ns as string */
  create_time_ns?: string
  transact_time_ns?: string
  match_count?: number
  match_index?: number
}

export interface CdcTradesResult {
  data: CdcTrade[]
}

// ── private/get-transactions (journal) ────────────────────────────────────

/** Documented journal types (others may appear; classifier falls back to UNKNOWN) */
export type CdcJournalType =
  | 'TRADING'
  | 'TRADE_FEE'
  | 'ONCHAIN_WITHDRAWAL'
  | 'ONCHAIN_DEPOSIT'
  | 'FUNDING'
  | 'REALIZED_PNL'
  | 'INSURANCE_FUND'
  | 'SOCIALIZED_LOSS'
  | 'LIQUIDATION_FEE'
  | 'SESSION_RESET'
  | 'ADJUSTMENT'
  | 'SESSION_SETTLE'
  | 'UNCOVERED_LOSS'
  | 'ADMIN_ADJUSTMENT'
  | 'DELIST'
  | 'SETTLEMENT_FEE'
  | 'AUTO_CONVERSION'
  | 'MANUAL_CONVERSION'
  | 'SUBACCOUNT_TX'
  | 'FIAT_WITHDRAWAL_CANCEL'
  | 'MARGIN_TRADE_INTEREST'
  | (string & {})

export interface CdcJournalEntry {
  account_id: string
  event_date: string
  journal_type: CdcJournalType
  journal_id: string
  transaction_qty: string
  transaction_cost: string
  realized_pnl?: string
  order_id?: string
  trade_id?: string
  trade_match_id?: string
  client_oid?: string
  taker_side?: string
  side?: 'BUY' | 'SELL' | string
  instrument_name?: string
  /** Epoch ms */
  event_timestamp_ms: number
  /** Epoch ns as string */
  event_timestamp_ns?: string
}

export interface CdcTransactionsResult {
  data: CdcJournalEntry[]
}

// ── Wallet API: deposit / withdrawal history ──────────────────────────────

/** 0: Not Arrived, 1: Arrived, 2: Failed, 3: Pending */
export type CdcDepositStatus = '0' | '1' | '2' | '3'
/** 0: Pending, 1: Processing, 2: Rejected, 3: Payment In-progress, 4: Payment Failed, 5: Completed, 6: Cancelled */
export type CdcWithdrawalStatus = '0' | '1' | '2' | '3' | '4' | '5' | '6'

export interface CdcDepositRecord {
  id: string
  currency: string
  amount: number | string
  fee?: number | string
  address?: string
  txid?: string
  network_id?: string | null
  status: CdcDepositStatus
  /** Epoch ms */
  create_time: number
  update_time?: number
}

export interface CdcWithdrawalRecord {
  id: string
  client_wid?: string
  currency: string
  amount: number | string
  fee?: number | string
  address?: string
  txid?: string
  network_id?: string | null
  status: CdcWithdrawalStatus
  /** Epoch ms */
  create_time: number
  update_time?: number
}

export interface CdcDepositHistoryResult {
  deposit_list: CdcDepositRecord[]
}

export interface CdcWithdrawalHistoryResult {
  withdrawal_list: CdcWithdrawalRecord[]
}

// ── Staking API ───────────────────────────────────────────────────────────

export interface CdcStakingPosition {
  /** e.g. "SOL.staked" */
  instrument_name: string
  underlying_inst_name?: string
  staked_quantity: string
  pending_staked_quantity?: string
  pending_unstaked_quantity?: string
  reward_eligible_quantity?: string
}

export interface CdcStakingPositionResult {
  data: CdcStakingPosition[]
}

export interface CdcStakingReward {
  staking_inst_name: string
  underlying_inst_name: string
  reward_inst_name: string
  reward_quantity: string
  staked_balance?: string
  /** Epoch ms */
  event_timestamp_ms: number | string
}

export interface CdcStakingRewardHistoryResult {
  data: CdcStakingReward[]
}

// ── public/get-instruments ────────────────────────────────────────────────

export interface CdcInstrument {
  symbol: string
  inst_type: string
  display_name?: string
  base_ccy: string
  quote_ccy: string
  quote_decimals?: number
  quantity_decimals?: number
  price_tick_size?: string
  qty_tick_size?: string
  tradable?: boolean
}

export interface CdcInstrumentsResult {
  data: CdcInstrument[]
}

// ── public/get-candlestick ────────────────────────────────────────────────

/** Timeframes accepted by public/get-candlestick */
export type CdcTimeframe = '1m' | '5m' | '15m' | '30m' | '1h' | '2h' | '4h' | '12h' | '1D' | '7D' | '14D' | '1M'

export interface CdcCandle {
  /** Epoch ms */
  t: number
  o: string
  h: string
  l: string
  c: string
  v: string
}

export interface CdcCandlestickResult {
  instrument_name: string
  interval: string
  data: CdcCandle[]
}
