import type { BrokerageCredentials } from '@lokfi/brokerage-core'
import { CredentialManager, type CredentialStore } from '../brokerage/credential-manager'
import { db } from '../db/db'

const credentialStore: CredentialStore = {
  async get(provider) {
    const setting = await db.settings.get(`ai-credentials:${provider}`)
    return setting ? (JSON.parse(setting.value) as BrokerageCredentials) : undefined
  },
  async put(record) {
    await db.settings.put({ key: `ai-credentials:${record.id}`, value: JSON.stringify(record) })
  },
  async delete(provider) {
    await db.settings.delete(`ai-credentials:${provider}`)
  },
}

export const aiCredentials = new CredentialManager(credentialStore)

export async function getAiCredentialRevision(provider: string): Promise<string | null> {
  // The salt changes whenever a key is saved, without exposing the encrypted key or its value.
  return (await credentialStore.get(provider))?.salt ?? null
}
