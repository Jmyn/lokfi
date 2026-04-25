# AGENTS.md

## Monorepo

pnpm workspaces + Turborepo. Packages: `apps/web` (Vite + React 19), `packages/parser-core`, `packages/parser-seed`.

## Commands

```bash
pnpm dev      # start all dev servers (turbo)
pnpm build    # build all packages
pnpm lint     # typecheck all packages
pnpm test     # build then test all packages (turbo test dependsOn ^build)
```

Package-specific commands:

```bash
pnpm --filter @lokfi/parser-core run test-parser  # run parser dev tool
pnpm --filter @lokfi/parser-seed run seed --input <f> --output <f>  # anonymize real PDFs
```

Test file pattern: `*.test.ts`. Run single package: `pnpm --filter <pkg> test`.

## Architecture Notes

- **Data**: Dexie.js (IndexedDB) — not localStorage. `lokfi-db` v2 schema. `manualCategory` on transactions overrides rule engine; never auto-updated by rules.
- **PDF parsing**: runs in a Web Worker via `pdfjs-dist`. Worker path set with `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)`.
- **Parser auto-detection**: `detectParser(text)` in `parser-core` tries each bank's `detect()` in order, returns first match.
- **Rule engine**: Manual Override → General Rules (ascending priority) → Uncategorized. No hash-pinned rules.

## Style

Prettier (semi: false, singleQuote, trailingComma: es5). No ESLint config detected — `lint` script uses `tsc --noEmit`.

## Key Files

- `docs/architecture.md` — full architecture doc with ADRs
- `CLAUDE.md` — shell command conventions (no compound commands, use `git -C`)
- `.claude/commands/conventional-commit.md` — commit convention
