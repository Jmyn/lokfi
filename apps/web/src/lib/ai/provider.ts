import type { AiCategorisationProvider } from './categorisationProvider'
import { OpenAiDecisions } from './openAiDecisions'

export const aiProvider = {
  id: 'openai',
  create(apiKey: string): AiCategorisationProvider {
    return new OpenAiDecisions(apiKey)
  },
}
