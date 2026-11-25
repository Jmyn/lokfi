import { z } from 'zod'
import { db } from '../db/db'
import { askLokfiModels } from './askLokfiSettings'
import { aiCredentials, getAiCredentialRevision } from './credentials'

const cacheKey = 'ai:openai:ask-model-availability'
const catalog = Object.keys(askLokfiModels).join(',')
const cacheLifetime = 24 * 60 * 60 * 1000

const modelSchema = z.object({ id: z.string(), shutdown_date: z.string().date().nullish() })
const cacheSchema = z.object({
  revision: z.string(),
  catalog: z.string(),
  checkedAt: z.number(),
  models: z.array(modelSchema),
})
type Availability = z.infer<typeof cacheSchema>

export async function readOpenAiModelAvailability(revision: string | null): Promise<Availability | null> {
  if (!revision) return null
  const record = await db.settings.get(cacheKey)
  if (!record) return null

  try {
    const result = cacheSchema.safeParse(JSON.parse(record.value))
    return result.success && result.data.revision === revision && result.data.catalog === catalog ? result.data : null
  } catch {
    return null
  }
}

export function isOpenAiModelListFresh(availability: Availability | null, now = Date.now()) {
  return !!availability && now - availability.checkedAt < cacheLifetime
}

export function getOpenAiModelStatus(
  availability: Availability | null,
  id: string,
  today = new Date().toISOString().slice(0, 10)
) {
  if (!availability) return { available: true, shutdownDate: null }
  const result = availability.models.find((model) => model.id === id)
  const shutdownDate = result?.shutdown_date ?? null
  return { available: !!result && (!shutdownDate || shutdownDate > today), shutdownDate }
}

export async function refreshOpenAiModelAvailability(revision: string, signal: AbortSignal): Promise<void> {
  const credentials = await aiCredentials.retrieve('openai')
  signal.throwIfAborted()
  if ((await getAiCredentialRevision('openai')) !== revision) return
  if (!credentials?.apiKey) throw new Error('Save your OpenAI API key to check model availability.')

  const checkedAt = Date.now()
  const response = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${credentials.apiKey}` },
    signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
  })
  if (!response.ok) throw new Error('OpenAI could not list models for this key.')
  const result = z.object({ data: z.array(modelSchema) }).parse(await response.json())
  const models = result.data.filter(({ id }) => Object.hasOwn(askLokfiModels, id))

  await db.transaction('rw', db.settings, async () => {
    signal.throwIfAborted()
    if ((await getAiCredentialRevision('openai')) !== revision) return
    const existing = await readOpenAiModelAvailability(revision)
    if (existing && existing.checkedAt > checkedAt) return
    await db.settings.put({ key: cacheKey, value: JSON.stringify({ revision, catalog, checkedAt, models }) })
  })
}
