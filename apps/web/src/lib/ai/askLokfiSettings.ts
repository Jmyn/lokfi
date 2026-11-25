import { db } from '../db/db'

export const askLokfiEfforts = {
  none: 'None',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra high',
  max: 'Maximum',
} as const

const requiredReasoning = ['low', 'medium', 'high', 'xhigh', 'max'] as const
const optionalReasoning = ['none', ...requiredReasoning] as const

// Responses models verified against Ask Lokfi's structured output schema.
export const askLokfiModels = {
  'gpt-6-luna': { label: 'GPT-6 Luna', efforts: optionalReasoning },
  'gpt-6.1-terra': { label: 'GPT-6.1 Terra', efforts: optionalReasoning },
  'gpt-6.2-sol': { label: 'GPT-6.2 Sol', efforts: requiredReasoning },
} as const

export interface AskLokfiSettings {
  model: keyof typeof askLokfiModels
  reasoningEffort: keyof typeof askLokfiEfforts
}

const settingsKey = 'ai:ask-lokfi'
const defaults: AskLokfiSettings = { model: 'gpt-6-luna', reasoningEffort: 'none' }
export const recommendedAskLokfiSettings: AskLokfiSettings = { model: 'gpt-6.1-terra', reasoningEffort: 'low' }

export function supportsAskLokfiEffort(model: AskLokfiSettings['model'], effort: string) {
  return askLokfiModels[model].efforts.some((supported) => supported === effort)
}

function normalizeSettings(settings: Partial<AskLokfiSettings>): AskLokfiSettings {
  const model =
    typeof settings.model === 'string' && Object.hasOwn(askLokfiModels, settings.model)
      ? settings.model
      : defaults.model
  const effort = settings.reasoningEffort ?? defaults.reasoningEffort
  return { model, reasoningEffort: supportsAskLokfiEffort(model, effort) ? effort : 'low' }
}

export async function getAskLokfiSettings(): Promise<AskLokfiSettings> {
  const setting = await db.settings.get(settingsKey)
  if (setting) {
    try {
      return normalizeSettings(JSON.parse(setting.value))
    } catch {
      return { ...defaults }
    }
  }
  return { ...defaults }
}

export async function updateAskLokfiSettings(changes: Partial<AskLokfiSettings>): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const settings = normalizeSettings({ ...(await getAskLokfiSettings()), ...changes })
    await db.settings.put({ key: settingsKey, value: JSON.stringify(settings) })
  })
}
