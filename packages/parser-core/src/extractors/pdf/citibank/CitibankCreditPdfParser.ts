import { MONTH_ABBR, parseAmount } from '../../../parsers/generic/csvUtils'
import { type CreditStatement, ParseError, type StatementParser, type Transaction } from '../../../types'

const SOURCE = 'citibank'
const BANK_HEADER = /^Citibank Singapore (?:Ltd\.?|Limited)[^\S\n]*$/im
const STATEMENT_DATE = /^Statement Date:?[ \t]+([A-Za-z]+)[ \t]+\d{1,2},[ \t]+(\d{4})\b/im
const TABLE_HEADER = /^DATE[ \t]+DESCRIPTION[ \t]+AMOUNT \(SGD\)[^\S\n]*$/im
const PAGE_CARD = /^CITI\b[^\n]*?\b((?:\d{4} +){3}\d{4}) +Payment Due Date:/im
const CARD_SECTION = /^CITI\b.*?\b((?:\d{4} +){3}\d{4}) +- /i
const TRANSACTION_DATE = /^(\d{1,2}) +([A-Za-z]{3})(?: +|$)/
// PDF.js can append a 16-digit page reference after the SGD amount on the first row.
const TRANSACTION_DETAILS = /^(.+?)\s+(\(\s*[\d,]+\.\d{2}\s*\)|[\d,]+\.\d{2})(?:\s+\d{16})?$/

export class CitibankCreditPdfParser implements StatementParser {
  readonly label = 'Citibank Credit PDF'

  detect(text: string): boolean {
    return BANK_HEADER.test(text) && TABLE_HEADER.test(text) && /^TRANSACTIONS FOR CITI\b/im.test(text)
  }

  parse(text: string): CreditStatement {
    if (!this.detect(text)) {
      throw new ParseError('Not a Citibank Singapore credit card statement', SOURCE)
    }

    const statementDate = text.match(STATEMENT_DATE)
    const statementMonth = Number(MONTH_ABBR[statementDate?.[1]?.slice(0, 3).toLowerCase() ?? ''])
    if (!statementDate || !statementMonth) {
      throw new ParseError('Could not read the Citibank statement date', SOURCE)
    }
    const statementYear = Number(statementDate[2])

    const accountNo = text.match(PAGE_CARD)?.[1]?.replace(/ /g, '')
    if (!accountNo) {
      throw new ParseError('Could not read the Citibank card number', SOURCE)
    }

    const transactions: Transaction[] = []
    for (const page of text.split(/^--- Page Break ---$/m)) {
      let currentAccount = page.match(PAGE_CARD)?.[1]?.replace(/ /g, '') ?? accountNo
      let inTable = false

      for (const rawLine of page.split('\n')) {
        const line = rawLine.trim()
        if (TABLE_HEADER.test(line)) {
          inTable = true
          continue
        }
        if (/^GRAND TOTAL\b/i.test(line)) break
        if (!inTable) continue

        const cardSection = line.match(CARD_SECTION)
        if (cardSection) {
          currentAccount = cardSection[1]!.replace(/ /g, '')
          continue
        }

        const date = line.match(TRANSACTION_DATE)
        if (!date) continue

        const day = Number(date[1])
        const month = MONTH_ABBR[date[2]!.toLowerCase()]
        const year = Number(month) > statementMonth ? statementYear - 1 : statementYear
        const details = line.slice(date[0].length).match(TRANSACTION_DETAILS)
        const amount = details ? parseAmount(details[2]!) : null

        if (!month || new Date(Date.UTC(year, Number(month) - 1, day)).getUTCDate() !== day) {
          throw new ParseError('Invalid transaction date in Citibank statement', SOURCE)
        }
        if (!details || amount === null) {
          throw new ParseError('Could not read a Citibank transaction amount', SOURCE)
        }

        transactions.push({
          date: `${year}-${month}-${String(day).padStart(2, '0')}`,
          description: details[1]!.replace(/\s+/g, ' '),
          transactionValue: amount === 0 ? 0 : -amount,
          accountNo: currentAccount,
        })
      }
    }

    if (transactions.length === 0) {
      throw new ParseError('No transactions found in Citibank statement', SOURCE)
    }

    return { source: SOURCE, statementType: 'credit', accountNo, transactions }
  }
}
