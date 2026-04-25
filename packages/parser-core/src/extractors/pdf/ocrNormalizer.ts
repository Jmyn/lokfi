/**
 * OCR Normalizer — cleans common artifacts from PDF text extraction.
 *
 * These patterns arise from scanned documents processed by OCR software:
 * - Full-width/hyphen hybrids: `一` (U+4E00), `二` (U+4E8C), etc. appearing as `-`
 * - Consecutive spaces from column-aligned PDF layouts
 * - Wrapped description lines broken mid-word with arbitrary hyphens or spaces
 */

/** Characters that OCR commonly misreads as hyphens or dashes. */
const OCR_HYPHEN_REPLACEMENTS: Array<[RegExp, string]> = [
  // Full-width hyphens and dashes
  [/\u2014/g, '-'], // em-dash
  [/\u2013/g, '-'], // en-dash
  [/\u00AD/g, '-'], // soft hyphen
  [/\u2010/g, '-'], // hyphen
  [/\u2011/g, '-'], // non-breaking hyphen
  // CJK characters that OCR misreads as hyphens
  [/\u4E00/g, '-'], // 一 (one)
  [/\u4E8C/g, '-'], // 二 (two)
  [/\u4E09/g, '-'], // 三 (three) — appears in "Tesco-3" style corruption
  // Other common OCR artifacts
  [/\u2500/g, '-'], // box drawing horizontal
  [/\u2012/g, '-'], // figure dash
]

/** Whitespace sequences (excluding newlines) to collapse to single space. */
const WHITESPACE_CLEANUP_RE = /[^\S\n]{2,}/g

/**
 * Pure function: cleans OCR artifacts from raw PDF text.
 *
 * @param raw Raw text extracted from PDF via pdfjs-dist
 * @returns Cleaned text with OCR artifacts fixed
 */
export function normalizeOcrText(raw: string): string {
  let text = raw

  // Step 1: Replace OCR hyphen variants
  for (const [pattern, replacement] of OCR_HYPHEN_REPLACEMENTS) {
    text = text.replace(pattern, replacement)
  }

  // Step 2: Collapse consecutive whitespace (but not newlines)
  text = text.replace(WHITESPACE_CLEANUP_RE, ' ')

  // Step 3: Trim each line and rejoin
  text = text
    .split('\n')
    .map((line) => line.trim())
    .join('\n')

  return text
}
