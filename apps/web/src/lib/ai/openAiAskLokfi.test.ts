import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AskLokfiRequest } from './askLokfiPlan'
import { OpenAiAskLokfi } from './openAiAskLokfi'

const request: AskLokfiRequest = {
  question: 'Show my spending',
  today: '2026-11-24',
  page: '/finances',
  sources: [],
  accounts: [],
  categories: [],
  currentScope: {},
  previous: null,
  reports: {},
}

afterEach(() => vi.unstubAllGlobals())

describe('OpenAiAskLokfi preferences', () => {
  it('uses the selected model and reasoning effort for the Responses request', async () => {
    const plan = {
      action: 'spending',
      scopeBase: 'current_filters',
      report: null,
      scope: {
        dateFrom: null,
        dateTo: null,
        source: null,
        account: null,
        category: null,
        description: null,
        excludeCategories: null,
        excludeTransfers: null,
        excludeInvestments: null,
      },
      rule: null,
      clarificationKind: null,
      message: null,
    }
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        status: 'completed',
        output: [{ content: [{ type: 'output_text', text: JSON.stringify(plan) }] }],
      })
    )
    vi.stubGlobal('fetch', fetchMock)
    const { signal } = new AbortController()
    vi.stubGlobal('AbortSignal', { any: () => signal, timeout: () => signal })

    const provider = new OpenAiAskLokfi('test-key', { model: 'gpt-6.1-terra', reasoningEffort: 'low' })
    await expect(provider.plan(request, signal)).resolves.toEqual(plan)

    const [url, options] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.openai.com/v1/responses')
    expect(JSON.parse(options.body)).toMatchObject({ model: 'gpt-6.1-terra', reasoning: { effort: 'low' } })
  })
})
