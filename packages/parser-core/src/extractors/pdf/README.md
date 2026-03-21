# PDF Parser Guide

Learnings from building the OCBC parser — a field guide for implementing subsequent bank PDF parsers.

---

## How the Pipeline Works

```
User drops PDF
    → pdf.worker.ts (pdfjs-dist, Web Worker)
        → getTextContent() per page
        → sort items by Y desc, X asc (top-left reading order)
        → items within 1px Y-delta merged into one line
        → multi-space sequences collapsed to single space (ocrNormalizer)
        → pages joined with "--- Page Break ---"
    → ParserRegistry.detect() on each registered parser
    → Matching parser.parse() → Statement
```

The raw text you get from `pdf.worker.ts` is **what you must design against**. It is not a layout-faithful rendering — it is a spatially reconstructed string where visual columns get merged into a single line and all column spacing is collapsed to one space.

---

## Step 0: Always Extract Raw Text First

Before writing a single line of parser code, run the dump script on a real statement:

```bash
node scripts/dump-pdf-text.mjs "statements/<bank>/<file>.pdf"
```

This script replicates the exact `reconstructText` logic from `pdf.worker.ts`. What you see in the terminal is exactly what your parser will receive.

**Do not assume** the PDF looks like the visual layout. Common surprises:

- Columns merged into one line (date + description + amount all on the same line)
- Header rows repeated on every page
- Fine-print blocks spanning 10–15 lines before the transaction section
- Card numbers appearing after lengthy legal disclaimers, not at the top
- Instalment plan summary sections that superficially look like transactions

---

## Anatomy of a Bank PDF Statement (OCBC as Reference)

```
[Bank header / address]           ← multiple lines
[Contact / reference numbers]
[Statement date: DD-MM-YYYY ...]  ← metadata — extract year/month here
[Cardholder address]
[Fine print]                      ← can be 10–20 lines; pushes card numbers down
[Fine print continued]
TRANSACTION DATE  DESCRIPTION  AMOUNT (SGD)   ← column headers
[CARD PRODUCT NAME]               ← e.g. "OCBC NXT CREDIT CARD"
[Cardholder Name]  NNNN-NNNN-NNNN-NNNN        ← card number line (account switch marker)
LAST MONTH'S BALANCE  NNNN.NN   ← NOT a transaction
DD/MM  Description  [Orig $X.XX ref/total]  amount.xx   ← transaction
DD/MM  Description  (amount.xx )            ← credit/payment — parens = negative
...
SUBTOTAL  NNN.NN                  ← section end (continue, not break)
[Supplementary Cardholder]  NNNN-NNNN-NNNN-NNNN  ← account switch
DD/MM  ...
SUBTOTAL  NNN.NN                  ← section end (continue)
TOTAL  NNN.NN                     ← card group end (continue, not break)
[SECOND CARD PRODUCT NAME]
[Cardholder Name]  NNNN-NNNN-NNNN-NNNN       ← account switch
DD/MM  ...
--- Page Break ---                ← page separator (ignored — not a stop condition)
TRANSACTION DATE  DESCRIPTION  AMOUNT (SGD)   ← column headers repeated on page 2
...
SUBTOTAL  NNN.NN
TOTAL  NNN.NN
TOTAL AMOUNT DUE  NNN.NN         ← TRUE document end (break)
[Instalment Plan Summary]         ← AFTER true end — must not be parsed
```

---

## Core Lessons

### 1. Date format is bank-specific — extract raw text first

Never assume `DD MMM YYYY`. OCBC uses `DD/MM` with the year absent from transaction lines. The year must be inferred from the statement header (`DD-MM-YYYY`).

**Handle cross-year** (October transactions in a November statement):

```typescript
const year = txnMonth > stmtMonth ? stmtYear - 1 : stmtYear
```

Common formats encountered:

| Bank | Transaction date format | Notes |
|------|------------------------|-------|
| OCBC | `DD/MM` | Year from header `DD-MM-YYYY` |
| Generic | `DD MMM YYYY`, `DD/MM/YYYY` | Year present inline |

### 2. Scan all lines for metadata — never slice by line count

Card numbers and account identifiers often appear after long fine-print blocks. OCBC's primary card number is around line 29 of the filtered text. A `slice(0, 20)` cap silently returns `UNKNOWN-ACCOUNT`.

```typescript
// Bad: silently misses card number at line 29
for (const line of lines.slice(0, 20)) { ... }

// Good: first match in document order is the primary card
for (const line of lines) { ... }
```

### 3. `isDocumentEnd` (break) vs `isSectionEnd` (continue) — never conflate them

Conflating these two is what caused only the first card section to be parsed.

| Line | Correct action | Why |
|------|---------------|-----|
| `SUBTOTAL` | `isSectionEnd` → continue | Ends one card's section; more cards follow |
| `TOTAL 1,027.84` | `isSectionEnd` → continue | Ends one card group; another card follows |
| `TOTAL AMOUNT DUE` | `isDocumentEnd` → break | True end of all transaction data |
| `MINIMUM PAYMENT` | `isDocumentEnd` → break | Same |

Check `isDocumentEnd` **before** `isSectionEnd` in the loop so more-specific patterns win.

### 4. Parenthesized amounts are credits — detect the parens separately

OCBC uses `(907.84 )` — note the space before the closing paren. `parseAmount("(907.84")` returns positive because the paren is unclosed. Detect sign intent via a separate regex:

```typescript
const hasCreditParens = /\(\s*[\d,]+\.\d{2}\s*\)/.test(line)
const transactionValue = hasCreditParens ? -Math.abs(rawValue) : rawValue
```

### 5. Instalment plan lines can look like transactions — stop before them

OCBC's Instalment Payment Plan Summary uses `DD MMM YYYY` dates (e.g. `02 Nov 2025`) that will match generic date regexes. The section appears after `TOTAL AMOUNT DUE`. If `isDocumentEnd` doesn't fire correctly, the parser will happily parse IPP rows as transactions — and return the wrong 6 records instead of the real 16.

Without the correct `isDocumentEnd`, the original OCBC parser was returning IPP rows, not actual credit card transactions. Always verify by counting: run the dump script, count real transactions manually, assert that count in the test.

### 6. Multi-amount lines — last amount is the transaction value

OCBC instalment lines have both the original purchase amount and the instalment amount:

```
02/11  TRAVEL WALLET  $2,000.00  001/006  335.00
```

The `001/006` is a plan reference (not a fraction or date). The **last** decimal value (`335.00`) is the actual charge this statement period. Using the first amount would overstate charges by 6×.

### 7. Per-transaction `accountNo` for consolidated statements

Consolidated statements contain multiple cards. All transactions must not be assigned the primary card's `accountNo`. Track the current card as you cross card number lines:

```typescript
const cardMatch = line.match(CARD_NUMBER_RE)
if (cardMatch) {
  currentAccountNo = cardMatch[0]!.replace(/[-\s]/g, '')
  i++; continue
}
// Then on each parsed txn:
if (currentAccountNo) txn.accountNo = currentAccountNo
```

`ImportPage` uses `txn.accountNo ?? stmt.accountNo` — the `??` fallback handles single-card parsers that don't set per-transaction `accountNo`.

---

## Checklist for a New Bank PDF Parser

```
[ ] 1. Run dump-pdf-text.mjs on a real statement — read every line
[ ] 2. Identify the date format (DD/MM? DD MMM YYYY? DD/MM/YYYY?)
[ ] 3. Does the date include the year? If not, extract it from the header
[ ] 4. Count real transaction rows manually — this becomes your test assertion
[ ] 5. Identify section structure:
        - What line ends a section within a card? (→ isSectionEnd, continue)
        - What line ends the entire transaction region? (→ isDocumentEnd, break)
        - What comes AFTER the transaction region? (ensure it's excluded)
[ ] 6. Identify card number format and position (may be after fine-print)
[ ] 7. Is this a consolidated statement? → track currentAccountNo
[ ] 8. How are credits/payments marked? (parens, CR suffix, negative sign)
[ ] 9. Are there multi-amount lines? (instalment plans) → which amount to use?
[  ] 10. Create an obfuscated fixture from the real PDF and write assertions
```

---

## File Structure

```
extractors/pdf/
  README.md               ← you are here
  index.ts                ← re-exports all parsers
  ocrNormalizer.ts        ← cleans OCR artifacts (em/en dashes, multi-space)
  GenericPdfParser.ts     ← fallback for unknown formats
  ocbc/
    OcbcCreditPdfParser.ts
    OcbcCreditPdfParser.test.ts
  [bank]/                 ← add new parsers in their own subdirectory
    [Bank]PdfParser.ts
    [Bank]PdfParser.test.ts
```

Register new parsers in two places:

1. `extractors/pdf/index.ts` — add export
2. `packages/parser-core/src/index.ts` → `ParserRegistry` — add instance to the registry

---

## Creating a Test Fixture

### Step 1 — Dump directly to a fixture file

```bash
node scripts/dump-pdf-text.mjs "statements/<bank>/<file>.pdf" -o packages/parser-core/src/extractors/pdf/<bank>/__fixtures__/<bank>-<mmm-yy>.txt
```

The `-o` flag writes only the clean joined text (no debug headers) straight to the fixture path. The directory is created automatically.

Open the file, scroll through it, and **manually count every real transaction line**. This number becomes your primary test assertion: `expect(stmt.transactions).toHaveLength(N)`.

> Without `-o`, the script prints per-page debug output to stdout — useful for exploring a new statement format before committing a fixture.

### Step 2 — Redact sensitive data in-place

Work through the dump line by line and replace the following. **Do not change line count, column structure, or any structural keywords** — the parser depends on the exact layout.

| What to redact | Rule | Example |
|---------------|------|---------|
| **Card numbers** (masked `**** **** **** XXXX`) | Keep last-4 slot, change digits to different fictional ones | `**** **** **** 1234` → `**** **** **** 7890` |
| **Card numbers** (unmasked 16-digit) | Replace all digits with plausible fictional ones, keep separator style | `1234 5678 9012 3456` → `9130 2055 0318 7890` |
| **Account holder name** | Replace with `REDACTED NAME` | `JOHN DOE` → `REDACTED NAME` |
| **Supplementary cardholder name** | Replace with `REDACTED SUPP` | `JANE DOE` → `REDACTED SUPP` |
| **Merchant names** | Replace with a plausible fictional equivalent of similar length and category | `LOCAL GROCER CO. LTD` → `DAILY MARKET CO. LTD` |
| **Transaction amounts** | Replace with fictional values; keep decimal format, sign, and rough magnitude | `123.45` → `110.00`, `(50.00 )` → `(45.00 )` |
| **Running balances / subtotals / totals** | Replace consistently so the arithmetic still looks plausible (exact correctness not required) | `SUBTOTAL 500.00` → `SUBTOTAL 450.00` |
| **Instalment original amounts** | Replace the full-purchase reference amount too | `$1,200.00 001/006 200.00` → `$960.00 001/006 160.00` |
| **Physical address** | Remove or replace with a fictional address | `123 REAL STREET #04-56` → `10 FICTIONAL ROAD #01-01` |
| **Reference / hold numbers** | Replace with different digits | `hold ref.no: Y 12345` → `hold ref.no: Y 99999` |

### What NOT to redact

Leave these exactly as they appear in the dump — the parser tests and the parser itself depend on them:

- Bank name (`OCBC Bank`, `DBS Bank`, etc.)
- Product names (`OCBC NXT CREDIT CARD`, `OCBC 365 CREDIT CARD`)
- Structural keywords: `SUBTOTAL`, `TOTAL`, `TOTAL AMOUNT DUE`, `LAST MONTH'S BALANCE`, `MINIMUM PAYMENT`
- Column headers: `TRANSACTION DATE   DESCRIPTION   AMOUNT (SGD)`
- Page break markers: `--- Page Break ---`
- Statement date line: `01-12-2025   24-12-2025   S$27,500   ...` (change amounts but keep date format)
- Fine-print paragraphs (can be trimmed for brevity but must start at the correct line depth)
- Instalment plan section structure (even though it's after TOTAL AMOUNT DUE)

### Step 3 — Validate the fixture manually

Before writing tests, paste the redacted text into a quick ad-hoc script and call `parser.parse()` on it. Confirm:

- Transaction count matches your manual count from Step 1
- No `UNKNOWN-ACCOUNT`
- First and last transaction descriptions look correct
- `accountNo` on transactions is populated (for consolidated statements)

### Step 4 — Read the file in the test (do not paste inline)

```typescript
import { readFileSync } from 'node:fs'

const BANK_DEC25_FIXTURE = readFileSync(
  new URL('./__fixtures__/<bank>-<mmm-yy>.txt', import.meta.url),
  'utf-8',
)

it('parses all N transactions', () => {
  expect(parser.parse(BANK_DEC25_FIXTURE).transactions).toHaveLength(N)
})
```

`new URL('./__fixtures__/...', import.meta.url)` resolves relative to the test file itself — no `__dirname` setup needed, works with Vitest's ESM mode.

Do **not** paste the fixture as an inline template literal. File-based fixtures:

- produce clean, readable diffs when the statement format changes
- can be re-generated by re-running the dump script + re-redacting
- keep test files focused on assertions, not data

Add extra fine-print lines around the card number to simulate real document depth — this catches regressions where a line-count scan limit is set too low.

---

## Signals That Something Is Wrong

| Symptom | Likely cause |
|---------|-------------|
| Transaction count matches the Instalment Plan row count | `isDocumentEnd` not firing; parser reading past TOTAL AMOUNT DUE |
| `UNKNOWN-ACCOUNT` despite card number visible in raw text | Card number appears after line ~20; scan limit too low |
| Only first card section parsed | `isSectionEnd`/`isDocumentEnd` conflated; SUBTOTAL triggers break |
| Dates parsed as descriptions | Date pattern too broad; matching mid-line patterns |
| Wrong transaction amounts (e.g. 6× too large) | First amount taken from instalment line instead of last |
| All transactions show primary card's accountNo | `currentAccountNo` tracking not implemented; consolidated statement |
