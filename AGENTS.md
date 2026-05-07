# AGENTS.md

## Monorepo

pnpm workspaces + Turborepo. Packages: `apps/web` (Vite + React 19), `packages/parser-core`, `packages/parser-seed`.

## Commands

```bash
pnpm dev      # start all dev servers (turbo)
pnpm build    # build all packages
pnpm lint     # lint, format all packages
pnpm test     # build then test all packages (turbo test dependsOn ^build)
```

Package-specific commands:

```bash
pnpm --filter @lokfi/parser-core run test-parser  # run parser dev tool
pnpm --filter @lokfi/parser-seed run seed --input <f> --output <f>  # anonymize real PDFs
```

Test file pattern: `*.test.ts`. Run single package: `pnpm --filter <pkg> test`.

## Architecture Notes

- **Data**: 
  - Dexie.js (IndexedDB) — not localStorage 
  - `manualCategory` on transactions overrides rule engine; never auto-updated by rules
  - ensure database schema changes are compatible with importing and exporting backups
- **PDF parsing**: runs in a Web Worker via `pdfjs-dist`. Worker path set with `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)`.
- **Parser auto-detection**: `detectParser(text)` in `parser-core` tries each bank's `detect()` in order, returns first match.
- **Rule engine**: Manual Override → General Rules (ascending priority) → Uncategorized. No hash-pinned rules.
