import { describe, expect, it } from 'vitest'
import { normalizeOcrText } from './ocrNormalizer'

describe('normalizeOcrText', () => {
  it('replaces full-width hyphens with standard hyphens', () => {
    expect(normalizeOcrText('Tesco一3')).toBe('Tesco-3')
    expect(normalizeOcrText('Miche一lin')).toBe('Miche-lin')
  })

  it('replaces em-dash and en-dash with hyphen', () => {
    expect(normalizeOcrText('Hello\u2014world')).toBe('Hello-world')
    expect(normalizeOcrText('Hello\u2013world')).toBe('Hello-world')
  })

  it('collapses consecutive whitespace', () => {
    expect(normalizeOcrText('Hello    world')).toBe('Hello world')
    expect(normalizeOcrText('Col1    Col2    Col3')).toBe('Col1 Col2 Col3')
  })

  it('trims each line individually', () => {
    expect(normalizeOcrText('  Hello  \n  World  ')).toBe('Hello\nWorld')
  })

  it('preserves paragraph breaks (double newlines)', () => {
    expect(normalizeOcrText('Para1\n\nPara2')).toBe('Para1\n\nPara2')
  })

  it('handles realistic OCBC merchant name corruption', () => {
    const corrupted = 'Tesco一3 Store & Cafe\nShangri一La Hotel'
    // 一→- and whitespace cleanup + trim
    expect(normalizeOcrText(corrupted)).toBe('Tesco-3 Store & Cafe\nShangri-La Hotel')
  })

  it('does not merge wrapped lines (pdfjs-dist handles line reconstruction)', () => {
    // pdfjs-dist with position-based reconstruction handles line joining;
    // the normalizer just cleans OCR artifacts, not line structure.
    expect(normalizeOcrText('Hello\nworld')).toBe('Hello\nworld')
    expect(normalizeOcrText('Shop-\nping')).toBe('Shop-\nping')
  })
})
