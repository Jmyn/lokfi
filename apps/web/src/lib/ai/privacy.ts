export function accountMask(accountNumbers: string[], replacement = '[account]'): (value: string) => string {
  const separator = '[\\s./_\\p{Pd}]'
  const separators = new RegExp(separator, 'gu')
  const numbers = [...new Set(accountNumbers.map((number) => number.trim()).filter(Boolean))]
  if (!numbers.length) return (value) => value

  const patterns = numbers
    .map((number) => ({ number, compact: number.replace(separators, '') }))
    .sort((a, b) => b.compact.length - a.compact.length)
    .map(({ number, compact }) => {
      if (/^\d+$/.test(compact)) return `(?<!\\d)${compact.split('').join(`${separator}*`)}(?!\\d)`
      const boundary = '[\\p{L}\\p{N}]'
      if (/^(?=[a-z\d]*\d)[a-z\d]+$/i.test(compact)) {
        return `(?<!${boundary})${compact.split('').join(`${separator}*`)}(?!${boundary})`
      }
      const exact = number.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      return `(?<!${boundary})${exact}(?!${boundary})`
    })
  const pattern = new RegExp(patterns.join('|'), 'giu')
  return (value) => value.replace(pattern, () => replacement)
}

export function maskPersonalText(value: string): string {
  return value
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[email]')
    .replace(/\b[STFGM]\d{7}[A-Z]\b/gi, '[identity number]')
    .replace(/\b[A-Z]{1,3}-[A-Z\d]{10,}\b/gi, '[reference]')
    .replace(/(?:\b(?:card|account|ending(?: in)?)\s+(?:[*•]+\s*)?|[*•]{2,}\s*)\d{4}\b/gi, '[account]')
    .replace(/(?<![\w.])(?:\+?\d[\d ()-]{6,22}\d)(?![\w.])/g, (value) =>
      /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '[number]'
    )
    .replace(/\b(?:full name|my name is|recipient name|payee name|cardholder name)\s*:?\s+[^,;\n.]+/gi, '[name]')
    .replace(/\b(?:home address|billing address|mailing address)\s*:?\s+[^;\n]+/gi, '[address]')
    .replace(
      /\b\d{1,6}[a-z]?\s+(?:[\p{L}][\p{L}.'’-]*\s+){1,5}(?:road|street|lane|avenue|drive|crescent|close|boulevard|place)\b/giu,
      '[address]'
    )
    .replace(
      /(\b(?:payments?|transfers?|sent|paid|received)\s+(?:to|from)\s+)[\p{L}][\p{L}.'’-]*(?:\s+[\p{L}][\p{L}.'’-]*){1,3}?(?=\s+at\s+\[address\])/giu,
      '$1[recipient]'
    )
    .replace(
      /(\b(?:transfers?|sent|received)\s+(?:to|from)\s+)[\p{L}][\p{L}.'’-]*(?:\s+[\p{L}][\p{L}.'’-]*){1,3}?(?=\s+(?:via|during|last|this|since)\b|[,;]|\s*$)/giu,
      '$1[recipient]'
    )
    .replace(/\p{Lu}[\p{Ll}.'’-]+(?:\s+\p{Lu}[\p{Ll}.'’-]+){1,3}(?=\s*(?:,|\bat)\s*\[address\])/gu, '[name]')
}

export function hasRecipientRequest(question: string): boolean {
  return /\b(?:(?:payments?|transfers?)\s+(?:made\s+)?(?:to|from)|(?:paid|sent|transferred)\s+to|received\s+from)(?:\s*[:–-]\s*|\s+)(?=[\p{L}\p{N}"“'‘])/iu.test(
    question
  )
}
