import fs from 'fs'
import path from 'path'
import { ParserRegistry, generateTransactionHash, CdcDebitParser, GenericCsvParser } from '../src/index'

const args = process.argv.slice(2)
const filePath = args[0]

if (!filePath) {
  console.error('\nUsage: pnpm test-parser <path-to-csv>')
  console.error('Example: pnpm test-parser ../../statements/cdc/debit/card_transactions_record_20251222_184213.csv\n')
  process.exit(1)
}

const resolvedPath = path.resolve(process.cwd(), filePath)

if (!fs.existsSync(resolvedPath)) {
  console.error(`\nError: File not found at ${resolvedPath}\n`)
  process.exit(1)
}

const text = fs.readFileSync(resolvedPath, 'utf-8')

const registry = new ParserRegistry()
// Register available parsers here
registry.register(new CdcDebitParser())
registry.register(new GenericCsvParser())

console.log(`\nScanning file: ${path.basename(resolvedPath)}...`)
const parser = registry.getParser(text)

if (!parser) {
  console.error('❌ No matching parser found for this statement format.\n')
  process.exit(1)
}

try {
  const statement = parser.parse(text)
  const consolidated = statement.transactions.map((txn, i) => ({
    ...txn,
    source: statement.source,
    accountNo: statement.accountNo,
    hash: generateTransactionHash(txn, i)
  }))

  console.log(`✅ Success! Detected parser for: ${statement.source.toUpperCase()}`)
  console.log(`📊 Parsed ${statement.transactions.length} transactions.\n`)
  
  if (consolidated.length > 0) {
    console.log('Sample of first 3 consolidated transactions:')
    console.log(JSON.stringify(consolidated.slice(0, 3), null, 2))
  }
} catch (error: any) {
  console.error(`\n❌ Parsing failed: ${error.message}\n`)
  process.exit(1)
}
