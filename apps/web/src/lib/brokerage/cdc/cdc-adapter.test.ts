import { describe, expect, it } from 'vitest'
import {
  adaptCandles,
  adaptDepositRecord,
  adaptJournalEntry,
  adaptPositionBalance,
  adaptStakingReward,
  adaptTrade,
  adaptUserBalance,
  adaptWithdrawalRecord,
  classifyJournalType,
  dedupeTransfers,
  num,
  splitInstrument,
} from './cdc-adapter'
import type {
  CdcDepositRecord,
  CdcJournalEntry,
  CdcPositionBalance,
  CdcStakingReward,
  CdcTrade,
  CdcUserBalance,
  CdcWithdrawalRecord,
} from './cdc-types'

describe('num', () => {
  it('parses decimal strings and passes numbers through', () => {
    expect(num('0.5')).toBe(0.5)
    expect(num(42)).toBe(42)
  })

  it('returns 0 for null, undefined, empty, and non-numeric values', () => {
    expect(num(null)).toBe(0)
    expect(num(undefined)).toBe(0)
    expect(num('')).toBe(0)
    expect(num('abc')).toBe(0)
  })
})

describe('splitInstrument', () => {
  it('splits base and quote on the first underscore', () => {
    expect(splitInstrument('BTC_USD')).toEqual({ base: 'BTC', quote: 'USD' })
  })

  it('returns the whole string as base when there is no underscore', () => {
    expect(splitInstrument('BTC')).toEqual({ base: 'BTC', quote: '' })
  })
})

describe('adaptPositionBalance', () => {
  const spot: CdcPositionBalance = {
    instrument_name: 'BTC',
    quantity: '0.5',
    market_value: '30000',
  }

  it('maps a spot token to a CRYPTO position with no cost basis', () => {
    const pos = adaptPositionBalance(spot)
    expect(pos).toMatchObject({
      id: 'BTC_CRYPTO_cdc',
      source: 'cdc',
      symbol: 'BTC',
      secType: 'CRYPTO',
      currency: 'USD',
      quantity: 0.5,
      avgCost: 0,
      marketValue: 30000,
    })
  })

  it('represents staked assets as distinct positions on the underlying token', () => {
    const staked = adaptPositionBalance({
      instrument_name: 'SOL.staked',
      quantity: '10',
      market_value: '1500',
    })
    expect(staked).toMatchObject({
      id: 'SOL.staked_CRYPTO_cdc',
      symbol: 'SOL',
      name: 'SOL (staked)',
      identifier: 'SOL.staked',
    })
  })

  it('keeps spot and staked positions distinct for the same token', () => {
    const sol = adaptPositionBalance({ instrument_name: 'SOL', quantity: '5', market_value: '750' })
    const staked = adaptPositionBalance({ instrument_name: 'SOL.staked', quantity: '10', market_value: '1500' })
    expect(sol?.id).not.toBe(staked?.id)
  })

  it('filters zero quantities and the USD settlement entry', () => {
    expect(adaptPositionBalance({ instrument_name: 'ETH', quantity: '0', market_value: '0' })).toBeNull()
    expect(adaptPositionBalance({ instrument_name: 'USD', quantity: '100', market_value: '100' })).toBeNull()
  })
})

describe('adaptUserBalance', () => {
  it('uses the USD position entry as cash and sums market values as net liquidation', () => {
    const raw: CdcUserBalance = {
      total_available_balance: '1000',
      total_cash_balance: '900',
      position_balances: [
        { instrument_name: 'USD', quantity: '1000', market_value: '1000' },
        { instrument_name: 'BTC', quantity: '0.5', market_value: '30000' },
      ],
    }
    const account = adaptUserBalance(raw)
    expect(account.id).toBe('cdc_USD')
    expect(account.cashBalance).toBe(1000)
    expect(account.netLiquidation).toBe(31000)
  })

  it('falls back to total_cash_balance when no USD entry exists', () => {
    const raw: CdcUserBalance = {
      total_available_balance: '0',
      total_cash_balance: '50',
      position_balances: [{ instrument_name: 'BTC', quantity: '0.1', market_value: '6000' }],
    }
    const account = adaptUserBalance(raw)
    expect(account.cashBalance).toBe(50)
    expect(account.netLiquidation).toBe(6050)
  })
})

describe('adaptTrade', () => {
  const base: CdcTrade = {
    account_id: 'a1',
    event_date: '2026-06-01',
    journal_type: 'TRADING',
    traded_quantity: '0.1',
    traded_price: '60000',
    fees: '-6',
    fee_instrument_name: 'USD',
    order_id: 'o-1',
    trade_id: 't-1',
    side: 'BUY',
    instrument_name: 'BTC_USD',
    create_time: 1769900000000,
  }

  it('maps a fill to a transaction keyed by trade id', () => {
    const txn = adaptTrade(base)
    expect(txn).toMatchObject({
      id: 'cdc_t-1',
      source: 'cdc',
      orderId: 'o-1',
      symbol: 'BTC_USD',
      action: 'BUY',
      quantity: 0.1,
      price: 60000,
      currency: 'USD',
      commission: 6,
      secType: 'CRYPTO',
    })
    expect(txn?.executedAt).toBe(new Date(1769900000000).toISOString())
  })

  it('converts a base-token fee to quote currency via the traded price', () => {
    const txn = adaptTrade({ ...base, fees: '-0.0001', fee_instrument_name: 'BTC' })
    expect(txn?.commission).toBeCloseTo(0.0001 * 60000)
  })

  it('leaves commission undefined for fees in an unrelated token', () => {
    const txn = adaptTrade({ ...base, fees: '-2', fee_instrument_name: 'CRO' })
    expect(txn?.commission).toBeUndefined()
  })

  it('returns null for missing trade id or zero quantity', () => {
    expect(adaptTrade({ ...base, trade_id: '' })).toBeNull()
    expect(adaptTrade({ ...base, traded_quantity: '0' })).toBeNull()
  })
})

describe('classifyJournalType', () => {
  it('maps every documented in-scope journal type', () => {
    expect(classifyJournalType('TRADING', 1)).toBe('TRADE')
    expect(classifyJournalType('TRADE_FEE', -1)).toBe('FEE')
    expect(classifyJournalType('ONCHAIN_DEPOSIT', 1)).toBe('TRANSFER_IN')
    expect(classifyJournalType('ONCHAIN_WITHDRAWAL', -1)).toBe('TRANSFER_OUT')
    expect(classifyJournalType('AUTO_CONVERSION', 1)).toBe('CURRENCY_EXCHANGE')
    expect(classifyJournalType('MANUAL_CONVERSION', 1)).toBe('CURRENCY_EXCHANGE')
    expect(classifyJournalType('MARGIN_TRADE_INTEREST', -1)).toBe('FEE')
  })

  it('classifies SUBACCOUNT_TX by amount sign', () => {
    expect(classifyJournalType('SUBACCOUNT_TX', 100)).toBe('TRANSFER_IN')
    expect(classifyJournalType('SUBACCOUNT_TX', -100)).toBe('TRANSFER_OUT')
  })

  it('falls back to UNKNOWN for unmapped and missing types', () => {
    expect(classifyJournalType('SESSION_SETTLE', 0)).toBe('UNKNOWN')
    expect(classifyJournalType('SOME_FUTURE_TYPE', 0)).toBe('UNKNOWN')
    expect(classifyJournalType(undefined, 0)).toBe('UNKNOWN')
  })
})

describe('adaptJournalEntry', () => {
  it('maps a trading entry with action and quantity', () => {
    const entry: CdcJournalEntry = {
      account_id: 'a1',
      event_date: '2026-06-01',
      journal_type: 'TRADING',
      journal_id: 'j-1',
      transaction_qty: '0.1',
      transaction_cost: '-6000',
      side: 'BUY',
      instrument_name: 'BTC_USD',
      event_timestamp_ms: 1769900000000,
    }
    const fd = adaptJournalEntry(entry)
    expect(fd).toMatchObject({
      id: 'cdc_fund_j-1',
      source: 'cdc',
      rawType: 'TRADING',
      classifiedType: 'TRADE',
      symbol: 'BTC',
      amount: -6000,
      action: 'BUY',
      quantity: 0.1,
    })
  })

  it('uses quantity as amount when cost is zero (qty-denominated transfers)', () => {
    const entry: CdcJournalEntry = {
      account_id: 'a1',
      event_date: '2026-06-01',
      journal_type: 'ONCHAIN_DEPOSIT',
      journal_id: 'j-2',
      transaction_qty: '0.5',
      transaction_cost: '0',
      instrument_name: 'BTC',
      event_timestamp_ms: 1769900000000,
    }
    const fd = adaptJournalEntry(entry)
    expect(fd?.classifiedType).toBe('TRANSFER_IN')
    expect(fd?.amount).toBe(0.5)
  })

  it('returns null without a journal id or timestamp', () => {
    const entry = {
      account_id: 'a1',
      event_date: '',
      journal_type: 'TRADING',
      journal_id: '',
      transaction_qty: '1',
      transaction_cost: '1',
      event_timestamp_ms: 0,
    } as CdcJournalEntry
    expect(adaptJournalEntry(entry)).toBeNull()
  })
})

describe('wallet history adapters', () => {
  const deposit: CdcDepositRecord = {
    id: 'd-1',
    currency: 'BTC',
    amount: '0.5',
    fee: '0',
    status: '1',
    create_time: 1769900000000,
    txid: '0xabcdef1234567890',
  }

  it('maps an arrived deposit to a positive DEPOSIT_WITHDRAWAL record', () => {
    const fd = adaptDepositRecord(deposit)
    expect(fd).toMatchObject({
      id: 'cdc_fund_dep_d-1',
      classifiedType: 'DEPOSIT_WITHDRAWAL',
      symbol: 'BTC',
      amount: 0.5,
      quantity: 0.5,
      currency: 'BTC',
    })
  })

  it('skips deposits that have not arrived', () => {
    expect(adaptDepositRecord({ ...deposit, status: '3' })).toBeNull()
  })

  it('maps a completed withdrawal to a negative record and skips others', () => {
    const wd: CdcWithdrawalRecord = {
      id: 'w-1',
      currency: 'ETH',
      amount: 2,
      fee: 0.001,
      status: '5',
      create_time: 1769900000000,
    }
    const fd = adaptWithdrawalRecord(wd)
    expect(fd?.amount).toBe(-2)
    expect(fd?.commission).toBe(0.001)
    expect(adaptWithdrawalRecord({ ...wd, status: '0' })).toBeNull()
  })
})

describe('dedupeTransfers', () => {
  const journalTransfer = adaptJournalEntry({
    account_id: 'a1',
    event_date: '2026-06-01',
    journal_type: 'ONCHAIN_DEPOSIT',
    journal_id: 'j-9',
    transaction_qty: '0.5',
    transaction_cost: '0',
    instrument_name: 'BTC',
    event_timestamp_ms: 1769900000000,
  })
  const walletDeposit = adaptDepositRecord({
    id: 'd-9',
    currency: 'BTC',
    amount: '0.5',
    status: '1',
    create_time: 1769900100000,
  })

  it('drops a journal transfer duplicated by a wallet record', () => {
    if (!journalTransfer || !walletDeposit) throw new Error('fixture setup failed')
    const result = dedupeTransfers([journalTransfer], [walletDeposit])
    expect(result).toHaveLength(0)
  })

  it('keeps journal transfers with no wallet match and non-transfer entries', () => {
    if (!journalTransfer || !walletDeposit) throw new Error('fixture setup failed')
    const otherWallet = { ...walletDeposit, symbol: 'ETH' }
    expect(dedupeTransfers([journalTransfer], [otherWallet])).toHaveLength(1)

    const fee = adaptJournalEntry({
      account_id: 'a1',
      event_date: '2026-06-01',
      journal_type: 'TRADE_FEE',
      journal_id: 'j-10',
      transaction_qty: '0',
      transaction_cost: '-1',
      event_timestamp_ms: 1769900000000,
    })
    if (!fee) throw new Error('fixture setup failed')
    expect(dedupeTransfers([fee], [walletDeposit])).toHaveLength(1)
  })
})

describe('adaptStakingReward', () => {
  const reward: CdcStakingReward = {
    staking_inst_name: 'SOL.staked',
    underlying_inst_name: 'SOL',
    reward_inst_name: 'SOL',
    reward_quantity: '0.1',
    event_timestamp_ms: 1769900000000,
  }

  it('maps a reward to a DIVIDEND priced at the event-date market price', () => {
    const fd = adaptStakingReward(reward, 150)
    expect(fd).toMatchObject({
      classifiedType: 'DIVIDEND',
      symbol: 'SOL',
      amount: 0.1 * 150,
      quantity: 0.1,
      currency: 'USD',
      rawType: 'STAKING_REWARD',
    })
  })

  it('produces a zero-amount record (quantity preserved) when no price is available', () => {
    const fd = adaptStakingReward(reward, null)
    expect(fd?.amount).toBe(0)
    expect(fd?.quantity).toBe(0.1)
  })

  it('derives a stable id from event content', () => {
    const a = adaptStakingReward(reward, 150)
    const b = adaptStakingReward(reward, 150)
    expect(a?.id).toBe(b?.id)
  })
})

describe('adaptCandles', () => {
  it('maps candles to normalized bars with parsed OHLCV', () => {
    const bars = adaptCandles('BTC', [{ t: 1769900000000, o: '1', h: '2', l: '0.5', c: '1.5', v: '100' }], 'day')
    expect(bars[0]).toEqual({
      symbol: 'BTC',
      source: 'cdc',
      timestamp: 1769900000000,
      open: 1,
      high: 2,
      low: 0.5,
      close: 1.5,
      volume: 100,
      period: 'day',
    })
  })
})
