# Brokerage Integration Guide

## Overview

Each brokerage integration lives in its own subdirectory under `src/lib/brokerage/` and consists of:

- **Provider** — implements `BrokerageProvider` from `@lokfi/brokerage-core`; the only interface the sync pipeline talks to
- **Adapters** — map raw API shapes to normalized `Brokerage*` types
- **HTTP client** (optional) — handles auth, signing, and transport for the brokerage's specific API
- **Types** (optional) — raw API response types

Shared infrastructure lives at the `brokerage/` root:

| File | Role |
|------|------|
| `sync-orchestrator.ts` | Coordinates multi-category sync with retry + throttle |
| `credential-manager.ts` | AES-256-GCM encryption + PBKDF2 key derivation for API keys |
| `dexie-credential-store.ts` | Dexie-backed `CredentialStore` for encrypted blobs |
| `dexie-sync-adapter.ts` | Dexie-backed `SyncDatabase` for positions/transactions/etc. |

## The Contract: `BrokerageProvider`

Every integration implements this interface from `@lokfi/brokerage-core`:

```ts
interface BrokerageProvider {
  readonly source: string        // e.g. 'tiger', 'cdc'
  readonly displayName: string   // e.g. 'Tiger Brokers'

  fetchPositions(): Promise<BrokeragePosition[]>
  fetchTransactions(since: Date): Promise<BrokerageTransaction[]>
  fetchCorpActions(since: Date): Promise<BrokerageCorpAction[]>
  fetchAccount(): Promise<BrokerageAccount[]>
  validateConnection(): Promise<boolean>
}
```

The `source` string is the discriminator stored in every record — it must be unique per brokerage.

## Normalized Types

All raw API data maps to these types from `@lokfi/brokerage-core`:

- **`BrokeragePosition`** — holdings with `id: "${symbol}_${source}"`, `quantity`, `avgCost`, `marketValue`
- **`BrokerageTransaction`** — order fills with `id: "${source}_${orderId}"`, `action: 'BUY'|'SELL'`, `price`, `quantity`
- **`BrokerageCorpAction`** — dividends/splits/rights with `type: 'DIVIDEND'|'SPLIT'|'RIGHTS'|'OTHER'`
- **`BrokerageAccount`** — per-currency asset snapshots with `cashBalance`, `netLiquidation`

Provider-specific fields go into `BrokeragePositionExtension` (EAV pattern — `positionId + key + value`).

## Adding a New Brokerage

### 1. Scaffold the directory

```
src/lib/brokerage/<name>/
  <name>-provider.ts       ← BrokerageProvider implementation
  <name>-adapter.ts        ← raw → normalized type mappers
  <name>-types.ts          ← raw API response types (if needed)
  <name>-http-client.ts    ← auth + HTTP transport (if needed)
  <name>-provider.test.ts  ← tests
```

### 2. Implement the provider

```ts
// <name>-provider.ts
import type { BrokerageProvider, BrokerageAccount, BrokerageCorpAction, BrokeragePosition, BrokerageTransaction } from '@lokfi/brokerage-core'

export const SOURCE = 'my_brokerage'

export class MyProvider implements BrokerageProvider {
  readonly source = SOURCE
  readonly displayName = 'My Brokerage'

  async fetchPositions(): Promise<BrokeragePosition[]> {
    // 1. Call API
    // 2. Map raw responses via adapter functions
    // 3. Return normalized BrokeragePosition[]
  }

  async fetchTransactions(since: Date): Promise<BrokerageTransaction[]> {
    // ...
  }

  async fetchCorpActions(since: Date): Promise<BrokerageCorpAction[]> {
    // Return [] if the brokerage does not expose corp actions
    return []
  }

  async fetchAccount(): Promise<BrokerageAccount[]> {
    // ...
  }

  async validateConnection(): Promise<boolean> {
    try {
      // Lightweight auth check (e.g. fetch a single asset)
      return true
    } catch {
      return false
    }
  }
}
```

### 3. Create adapters

Keep the mapping logic in a separate adapter file. This keeps the provider clean and makes the mapping testable in isolation:

```ts
// <name>-adapter.ts
import type { BrokeragePosition } from '@lokfi/brokerage-core'
import type { RawPosition } from './<name>-types'
import { SOURCE } from './<name>-provider'

export function adaptPosition(raw: RawPosition): BrokeragePosition {
  return {
    id: `${raw.symbol}_${SOURCE}`,
    source: SOURCE,
    symbol: raw.symbol,
    quantity: raw.quantity,
    avgCost: raw.averageCost,
    currency: raw.currency ?? 'USD',
    updatedAt: new Date().toISOString(),
  }
}
```

### 4. Export from the barrel

Add your provider to `index.ts` so consumers can import from `@lokfi/web`:

```ts
// index.ts
export { MyProvider } from './<name>/<name>-provider'
export type { MyProviderOptions } from './<name>/<name>-provider'
```

No other registration is needed — consumers construct your provider directly and pass it to `SyncOrchestrator`.

### 5. Wire credentials

If your brokerage needs API keys:

1. The user enters credentials via the UI
2. The UI calls `CredentialManager.store(source, credentials, passphrase)` which encrypts with AES-256-GCM + PBKDF2
3. On sync, the UI calls `CredentialManager.retrieve(source, passphrase)` to get plaintext credentials
4. Your provider constructor receives whatever config it needs

Example credential flow in the consumer:

```ts
const passphrase = promptUserForPassphrase()
const creds = await credentialManager.retrieve('my_brokerage', passphrase)
const provider = new MyProvider({ apiKey: creds.apiKey, apiSecret: creds.apiSecret })
const orchestrator = new SyncOrchestrator({ provider, database: dexieAdapter })
await orchestrator.sync()
```

## How Sync Works

```
SyncOrchestrator.sync(categories?)
  ├─ throttle(category)      ← rate-limit per API tier
  ├─ provider.fetch*()       ← your provider
  ├─ db.upsert*()            ← persists to Dexie
  └─ db.insertSyncLog()      ← audit trail (success/failure)

Categories fail independently — positions can succeed even if transactions fail.
```

The `SyncOrchestrator` accepts any `BrokerageProvider` — switching brokerages is just a different provider instance.

## Existing Implementations

- **`tiger/`** — Full implementation. Tiger OpenAPI with RSA-signed requests via Web Crypto. Shows the complete pattern: typed HTTP client, adapter functions, provider class, credential store.
- **`cdc/`** — Stub placeholder (`CdcStubProvider`) returning empty arrays. Ready to be filled in with a real Crypto.com Exchange API integration.
