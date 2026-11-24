import type { BrokerageCredentials } from '@lokfi/brokerage-core'
import { CredentialManager } from '../brokerage/credential-manager'
import { db } from '../db/db'

export const aiCredentials = new CredentialManager({
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
})
