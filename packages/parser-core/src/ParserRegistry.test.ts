import { describe, it, expect } from 'vitest'
import { ParserRegistry } from './ParserRegistry'
import { CdcDebitParser } from './parsers/cdc/CdcDebitParser'

describe('ParserRegistry', () => {
  // ─── getParser() — empty registry ───────────────────────────────────────

  it('returns null when nothing is registered', () => {
    const registry = new ParserRegistry()
    expect(registry.getParser('any text')).toBeNull()
  })

  it('returns fallback when no parsers registered but fallback is set', () => {
    const registry = new ParserRegistry()
    const mockFallback = { detect: () => true, parse: () => ({}) }
    registry.registerFallback(mockFallback)
    expect(registry.getParser('anything')).toBe(mockFallback)
  })

  // ─── getParser() — single parser ─────────────────────────────────────────

  it('returns the correct parser when detect() returns true', () => {
    const registry = new ParserRegistry()
    registry.register(new CdcDebitParser())

    const cdcText =
      'Timestamp (UTC),Transaction Description,Native Amount,Transaction Kind\n2025-12-22,Test,-10,vpos_purchase'
    const result = registry.getParser(cdcText)

    expect(result).toBeInstanceOf(CdcDebitParser)
  })

  it('avoids returning a parser if detect returns false', () => {
    const registry = new ParserRegistry()
    registry.register(new CdcDebitParser())

    const uobText = 'Transaction Date,Transaction Description,Balance\n2025-12-22,Test,-10'
    expect(registry.getParser(uobText)).toBeNull()
  })

  // ─── getParser() — multiple parsers ───────────────────────────────────────

  it('returns the first matching parser when multiple are registered', () => {
    const registry = new ParserRegistry()

    const firstParser = {
      detect: (text: string) => text.includes('FIRST'),
      parse: () => ({}),
    }
    const secondParser = {
      detect: (text: string) => text.includes('SECOND'),
      parse: () => ({}),
    }
    registry.register(firstParser)
    registry.register(secondParser)

    // Text matches both — first registered wins
    expect(registry.getParser('FIRST and SECOND')).toBe(firstParser)
  })

  it('falls through to second parser when first does not match', () => {
    const registry = new ParserRegistry()

    const firstParser = {
      detect: (text: string) => text.includes('NOTHERE'),
      parse: () => ({}),
    }
    const secondParser = {
      detect: (text: string) => text.includes('SECOND'),
      parse: () => ({}),
    }
    registry.register(firstParser)
    registry.register(secondParser)

    expect(registry.getParser('SECOND only')).toBe(secondParser)
  })

  // ─── getParser() — fallback ───────────────────────────────────────────────

  it('returns fallback parser if registered and no other parser matches', () => {
    const registry = new ParserRegistry()
    registry.register(new CdcDebitParser())

    const mockFallback = { detect: () => true, parse: () => ({}) }
    registry.registerFallback(mockFallback)

    const uobText = 'Transaction Date,Transaction Description,Balance\n2025-12-22,Test,-10'
    expect(registry.getParser(uobText)).toBe(mockFallback)
  })

  // Note: fallbackParser is returned directly (detect not called on fallback)
  // so any registered fallback is returned when no parser matches
  it('returns fallback regardless of its detect result when no parser matches', () => {
    const registry = new ParserRegistry()
    const mockFallback = { detect: () => false, parse: () => ({}) }
    registry.registerFallback(mockFallback)

    // Fallback is still returned even though detect() would return false
    expect(registry.getParser('any text')).toBe(mockFallback)
  })
})
