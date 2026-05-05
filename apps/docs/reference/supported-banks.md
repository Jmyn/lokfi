# Supported Banks

## Current Support

| Bank | Debit | Credit | CSV | Notes |
| ---- | ----- | ------ | --- | ----- |
| **OCBC** | — | ✅ | ✅ | PDF credit/debit statements & CSV transaction history |
| **Citibank** | — | — | Planned | |
| **UOB** | — | — | Planned | |
| **Crypto.com** | ✅ | — | ✅ | CSV card transaction history |
| **DBS / POSB** | Planned | Planned | Planned | Phase 2 |
| **Standard Chartered** | Planned | Planned | Planned | Phase 4 |
| **Generic CSV** | ✅ | — | ✅ | Customizable in-app generic CSV parser |
| **Generic PDF** | — | — | — | Fallback for unsupported banks |

## Parser Notes

### OCBC
- **PDF**: Supports both credit card and debit account statements
- **CSV**: Supports transaction history exports
- Parser auto-detection checks for OCBC-specific header patterns

### Crypto.com
- **CSV**: Supports card transaction history exports
- Ensure your export includes all required columns (date, description, amount, etc.)

### Generic CSV
For banks not explicitly supported, Lokfi provides a configurable CSV parser:
1. When importing, select "Generic CSV" as the parser
2. Map the CSV columns to Lokfi's expected fields (date, description, amount)
3. The parser will remember your mapping for future imports

## Requesting a Bank

If your bank isn't supported, you can:

1. Open a [feature request on GitHub](https://github.com/jmyn/lokfi/issues)
2. Submit a sample anonymized statement (see `@lokfi/parser-seed` package)
3. Contribute a parser — the parser-core package is designed to be extensible
