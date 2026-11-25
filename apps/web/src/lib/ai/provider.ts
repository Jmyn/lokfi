import type { AskLokfiProvider } from './askLokfiPlan'
import type { AskLokfiSettings } from './askLokfiSettings'
import type { AiCategorisationProvider } from './categorisationProvider'
import { OpenAiAskLokfi } from './openAiAskLokfi'
import { OpenAiDecisions } from './openAiDecisions'

export const aiProvider = {
  id: 'openai',
  create(apiKey: string): AiCategorisationProvider {
    return new OpenAiDecisions(apiKey)
  },
  createAssistant(apiKey: string, settings: AskLokfiSettings): AskLokfiProvider {
    return new OpenAiAskLokfi(apiKey, settings)
  },
}
