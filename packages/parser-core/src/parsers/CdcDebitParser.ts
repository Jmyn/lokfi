import Papa from 'papaparse'
import { StatementParser, DebitStatement, Transaction, ParseError } from '../types'

export class CdcDebitParser implements StatementParser {
  detect(text: string): boolean {
    if (!text) return false
    const firstLine = text.split('\n')[0]?.trim()
    return firstLine?.startsWith('Timestamp (UTC),Transaction Description') ?? false
  }

  parse(text: string): DebitStatement {
    if (!this.detect(text)) {
      throw new ParseError('Invalid CDC CSV header', 'cdc')
    }

    const { data, errors } = Papa.parse<string[]>(text, {
      skipEmptyLines: true,
    })

    if (errors.length > 0) {
      throw new ParseError(`CSV parse error: ${errors[0]?.message}`, 'cdc')
    }

    const transactions: Transaction[] = []
    
    // Skip header row
    for (let i = 1; i < data.length; i++) {
      const row = data[i]
      if (!row || row.length < 8) continue // Ensure we have enough columns

      // Col 0: Timestamp (UTC) "2025-12-22 18:42:13"
      const timestamp = row[0]
      if (!timestamp) continue
      const date = timestamp.split(' ')[0]! // "2025-12-22"

      // Col 1: Transaction Description
      const description = row[1]?.trim() || 'Unknown'

      // Col 7: Native Amount
      const nativeAmountStr = row[7]?.replace(/,/g, '') // remove commas if any
      const transactionValue = parseFloat(nativeAmountStr || '0')
      
      if (isNaN(transactionValue)) {
        continue // Skip invalid rows
      }

      transactions.push({
        date,
        description,
        transactionValue,
      })
    }

    return {
      source: 'cdc',
      statementType: 'debit',
      accountNo: 'CDC-CARD',
      transactions,
    }
  }
}
