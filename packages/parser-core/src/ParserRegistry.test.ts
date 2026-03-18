import { describe, it, expect } from 'vitest'
import { ParserRegistry } from './ParserRegistry'
import { CdcDebitParser } from './parsers/cdc/CdcDebitParser'

describe('ParserRegistry', () => {
  it('returns null when no parser matches', () => {
    const registry = new ParserRegistry()
    expect(registry.getParser('some random text')).toBeNull()
  })

  it('rteturns the correct parser when detect() returns true', () => {
    const registry = new ParserRegistry()
    registry.register(new CdcDebitParser())

    const cdcText = 'Timestamp (UTC),Transaction Description,Native Amount,Transaction Kind\n2025-12-22,Test,-10,vpos_purchase'
    const result = registry.getParser(cdcText)

    expect(result).toBeInstanceOf(CdcDebitParser)
  })

  it('avoids returning a parser if detect returns false', () => {
    const registry = new ParserRegistry()
    registry.register(new CdcDebitParser())

    const uobText = 'Transaction Date,Transaction Description,Balance\n2025-12-22,Test,-10'
    const result = registry.getParser(uobText)

    expect(result).toBeNull()
  })

  it('returns fallback parser if registered and no other parser matches', () => {
    const registry = new ParserRegistry()
    registry.register(new CdcDebitParser())

    const mockFallback = {
      detect: () => true,
      parse: () => ({} as any)
    }
    registry.registerFallback(mockFallback)

    const uobText = 'Transaction Date,Transaction Description,Balance\n2025-12-22,Test,-10'
    const result = registry.getParser(uobText)

    expect(result).toBe(mockFallback)
  })
})
